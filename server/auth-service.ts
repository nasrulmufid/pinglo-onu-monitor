import { sessionDurationMs, type AppRole, type AuthAuditLog, type AuthSession, type PublicUser } from "../shared/auth-types"
import { generateSessionToken, hashPassword, hashSessionToken, verifyPassword } from "./crypto-utils"
import { db, recordAuditLog, runTransaction } from "./db"

type UserRow = {
  id: string
  username: string
  password_hash: string
  name: string
  role: AppRole
  must_change_password: number
  created_at: string
  updated_at: string
}

type SessionWithUserRow = UserRow & {
  expires_at: number
}

type AuditRow = { id: string; actor: string; action: string; detail: string; created_at: string }

function nowText() {
  return new Date().toLocaleString("id-ID")
}

function rowToPublicUser(r: UserRow): PublicUser {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function rowToAuditLog(r: AuditRow): AuthAuditLog {
  return { id: r.id, actor: r.actor, action: r.action, detail: r.detail, createdAt: r.created_at }
}

function toSession(r: UserRow, expiresAt = Date.now() + sessionDurationMs): AuthSession {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    expiresAt,
    mustChangePassword: Boolean(r.must_change_password),
  }
}

function validateUserInput(
  input: { username?: string; name?: string; password?: string; role?: AppRole },
  requirePassword: boolean,
) {
  const username = input.username?.trim() ?? ""
  const name = input.name?.trim() ?? ""
  const password = input.password ?? ""
  if (!username || !name || !input.role) return "Username, nama, dan role wajib diisi."
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return "Username 3–32 karakter (huruf, angka, titik, underscore, strip)."
  }
  if (name.length > 80) return "Nama lengkap maksimal 80 karakter."
  if (requirePassword && password.length < 8) return "Password minimal 8 karakter."
  if (password && (password.length < 8 || password.length > 128)) {
    return "Password harus 8–128 karakter."
  }
  if (input.role !== "admin" && input.role !== "super-admin") return "Role tidak valid."
  return null
}

export function listAuthData() {
  return {
    users: (db.prepare("SELECT * FROM users ORDER BY rowid ASC").all() as UserRow[]).map(rowToPublicUser),
    auditLogs: (db.prepare("SELECT * FROM audit_logs ORDER BY sort_order DESC LIMIT 500").all() as AuditRow[]).map(rowToAuditLog),
  }
}

export function createSession(user: UserRow, meta?: { ip?: string; userAgent?: string }) {
  const now = Date.now()
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now)

  const token = generateSessionToken()
  const expiresAt = now + sessionDurationMs
  const ip = (meta?.ip || "-").slice(0, 64)
  const ua = (meta?.userAgent || "-").slice(0, 200)

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(hashSessionToken(token), user.id, expiresAt, nowText(), ip, ua)

  return { token, session: toSession(user, expiresAt) }
}

export function getSessionByToken(token: string): AuthSession | null {
  if (!token) return null
  const tokenHash = hashSessionToken(token)
  const row = db
    .prepare(
      `SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as SessionWithUserRow | undefined

  if (!row) return null
  if (row.expires_at <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash)
    return null
  }
  return toSession(row, row.expires_at)
}

export function revokeSession(token: string | undefined) {
  if (!token) return
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token))
}

export function revokeUserSessions(userId: string, exceptTokenHash?: string) {
  if (exceptTokenHash) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, exceptTokenHash)
  } else {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId)
  }
}

export function authenticateUser(
  username: string,
  password: string,
  meta?: { ip?: string; userAgent?: string },
): { token: string; session: AuthSession } | null {
  const cleanUser = username.trim()
  const row = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(cleanUser) as UserRow | undefined
  const check = verifyPassword(password, row?.password_hash ?? "")
  const ok = Boolean(row && check.valid)

  if (ok && row && check.needsRehash) {
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      hashPassword(password),
      nowText(),
      row.id,
    )
    row.password_hash = "rehashed"
  }

  recordAuditLog(
    cleanUser || "-",
    ok ? "login_success" : "login_failed",
    `${ok ? "Login berhasil" : "Percobaan login gagal"} (IP: ${meta?.ip || "-"})`,
  )

  if (!ok || !row) return null
  return createSession(row, meta)
}

export function changeOwnPassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
  currentToken?: string
  ip?: string
}) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as UserRow | undefined
  if (!row) return { ok: false as const, message: "Akun tidak ditemukan." }

  const newPass = input.newPassword ?? ""
  if (newPass.length < 8 || newPass.length > 128) {
    return { ok: false as const, message: "Password baru harus 8–128 karakter." }
  }

  const check = verifyPassword(input.currentPassword ?? "", row.password_hash)
  if (!check.valid) {
    return { ok: false as const, message: "Password saat ini salah." }
  }
  if (input.currentPassword === newPass) {
    return { ok: false as const, message: "Password baru harus berbeda dari password saat ini." }
  }

  const updatedAt = nowText()
  runTransaction(() => {
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?").run(
      hashPassword(newPass),
      updatedAt,
      row.id,
    )
    const keepHash = input.currentToken ? hashSessionToken(input.currentToken) : undefined
    revokeUserSessions(row.id, keepHash)
    recordAuditLog(row.username, "password_change", `Password akun diperbarui sendiri (IP: ${input.ip || "-"})`)
  })

  const freshSession = input.currentToken ? getSessionByToken(input.currentToken) : null
  return {
    ok: true as const,
    message: "Password berhasil diperbarui.",
    session: freshSession ?? toSession({ ...row, must_change_password: 0 }),
  }
}

export function createUser(input: { username: string; name: string; password: string; role: AppRole; actor: string }) {
  const err = validateUserInput(input, true)
  if (err) return { ok: false, message: err }
  const username = input.username.trim()
  if (db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(username)) {
    return { ok: false, message: "Username sudah dipakai." }
  }
  const createdAt = nowText()
  runTransaction(() => {
    db.prepare(
      `INSERT INTO users (id, username, password_hash, name, role, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(`user-${Date.now()}`, username, hashPassword(input.password), input.name.trim(), input.role, createdAt, createdAt)
    recordAuditLog(input.actor, "user_create", `User ${username} dibuat sebagai ${input.role}.`)
  })
  return { ok: true, message: "User berhasil ditambahkan.", ...listAuthData() }
}

export function updateUser(input: {
  id: string
  username: string
  name: string
  role: AppRole
  password?: string
  actor: string
}) {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(input.id) as UserRow | undefined
  if (!target) return { ok: false, message: "User tidak ditemukan." }
  const err = validateUserInput(input, false)
  if (err) return { ok: false, message: err }
  const username = input.username.trim()
  if (db.prepare("SELECT id FROM users WHERE id != ? AND LOWER(username) = LOWER(?)").get(input.id, username)) {
    return { ok: false, message: "Username sudah dipakai user lain." }
  }
  if (target.role === "super-admin" && input.role !== "super-admin") {
    const count = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super-admin'").get() as { count: number })
      .count
    if (count <= 1) return { ok: false, message: "Minimal harus ada satu Super Admin." }
  }

  const nextHash = input.password ? hashPassword(input.password) : target.password_hash
  const nextMustChange = input.password ? 0 : target.must_change_password
  runTransaction(() => {
    db.prepare(
      `UPDATE users SET username = ?, name = ?, role = ?, password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?`,
    ).run(username, input.name.trim(), input.role, nextHash, nextMustChange, nowText(), input.id)
    if (input.password || input.role !== target.role) {
      revokeUserSessions(input.id)
    }
    recordAuditLog(input.actor, "user_update", `User ${username} diperbarui${input.password ? " dan password diganti" : ""}.`)
  })
  return { ok: true, message: "User berhasil diperbarui.", ...listAuthData() }
}

export function deleteUser(input: { id: string; actor: string; actorUserId?: string }) {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(input.id) as UserRow | undefined
  if (!target) return { ok: false, message: "User tidak ditemukan." }
  if (input.actorUserId && target.id === input.actorUserId) {
    return { ok: false, message: "Tidak bisa menghapus akun Anda sendiri yang sedang aktif." }
  }
  if (target.role === "super-admin") {
    const count = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super-admin'").get() as { count: number })
      .count
    if (count <= 1) return { ok: false, message: "Minimal harus ada satu Super Admin." }
  }
  runTransaction(() => {
    revokeUserSessions(input.id)
    db.prepare("DELETE FROM users WHERE id = ?").run(input.id)
    recordAuditLog(input.actor, "user_delete", `User ${target.username} dihapus.`)
  })
  return { ok: true, message: "User berhasil dihapus.", ...listAuthData() }
}
