import { randomUUID } from "node:crypto"
import { sessionDurationMs, type AppRole, type AuthAuditLog, type AuthSession, type PublicUser } from "../shared/auth-types"
import { db, hashPassword } from "./db"

type UserRow = { id: string; username: string; password_hash: string; name: string; role: AppRole; created_at: string; updated_at: string }
type AuditRow = { id: string; actor: string; action: string; detail: string; created_at: string }

function nowText() { return new Date().toLocaleString("id-ID") }
function rowToPublicUser(r: UserRow): PublicUser { return { id: r.id, username: r.username, name: r.name, role: r.role, createdAt: r.created_at, updatedAt: r.updated_at } }
function rowToAuditLog(r: AuditRow): AuthAuditLog { return { id: r.id, actor: r.actor, action: r.action, detail: r.detail, createdAt: r.created_at } }
function toSession(r: UserRow): AuthSession { return { id: r.id, username: r.username, name: r.name, role: r.role, expiresAt: Date.now() + sessionDurationMs } }

function pushAudit(actor: string, action: string, detail: string) {
  db.prepare(`INSERT INTO audit_logs (id, actor, action, detail, created_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(`audit-${Date.now()}-${randomUUID()}`, actor, action, detail, nowText(), Date.now())
  db.prepare(`DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY sort_order DESC LIMIT 200)`).run()
}

function validateUserInput(input: { username?: string; name?: string; password?: string; role?: AppRole }, requirePassword: boolean) {
  const username = input.username?.trim(), name = input.name?.trim(), password = input.password ?? ""
  if (!username || !name || !input.role) return "Username, nama, dan role wajib diisi."
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) return "Username minimal 3 karakter (huruf, angka, titik, underscore, strip)."
  if (requirePassword && password.length < 6) return "Password minimal 6 karakter."
  if (input.role !== "admin" && input.role !== "super-admin") return "Role tidak valid."
  return null
}

export function listAuthData() {
  return {
    users: (db.prepare("SELECT * FROM users ORDER BY rowid ASC").all() as UserRow[]).map(rowToPublicUser),
    auditLogs: (db.prepare("SELECT * FROM audit_logs ORDER BY sort_order DESC LIMIT 200").all() as AuditRow[]).map(rowToAuditLog),
  }
}

export function authenticateUser(username: string, password: string): AuthSession | null {
  const cleanUser = username.trim()
  const row = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(cleanUser) as UserRow | undefined
  const ok = Boolean(row && row.password_hash === hashPassword(password))
  pushAudit(cleanUser || "-", ok ? "login_success" : "login_failed", ok ? "Login berhasil." : "Percobaan login gagal.")
  return ok && row ? toSession(row) : null
}

export function createUser(input: { username: string; name: string; password: string; role: AppRole; actor: string }) {
  const err = validateUserInput(input, true)
  if (err) return { ok: false, message: err }
  const username = input.username.trim()
  if (db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(username)) return { ok: false, message: "Username sudah dipakai." }
  const createdAt = nowText()
  db.prepare(`INSERT INTO users (id, username, password_hash, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(`user-${Date.now()}`, username, hashPassword(input.password), input.name.trim(), input.role, createdAt, createdAt)
  pushAudit(input.actor, "user_create", `User ${username} dibuat sebagai ${input.role}.`)
  return { ok: true, message: "User berhasil ditambahkan.", ...listAuthData() }
}

export function updateUser(input: { id: string; username: string; name: string; role: AppRole; password?: string; actor: string }) {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(input.id) as UserRow | undefined
  if (!target) return { ok: false, message: "User tidak ditemukan." }
  const err = validateUserInput(input, false)
  if (err) return { ok: false, message: err }
  const username = input.username.trim()
  if (db.prepare("SELECT id FROM users WHERE id != ? AND LOWER(username) = LOWER(?)").get(input.id, username)) return { ok: false, message: "Username sudah dipakai user lain." }
  if (target.role === "super-admin" && input.role !== "super-admin") {
    const count = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super-admin'").get() as { count: number }).count
    if (count <= 1) return { ok: false, message: "Minimal harus ada satu Super Admin." }
  }
  if (input.password && input.password.length < 6) return { ok: false, message: "Password minimal 6 karakter." }
  db.prepare(`UPDATE users SET username = ?, name = ?, role = ?, password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(username, input.name.trim(), input.role, input.password ? hashPassword(input.password) : target.password_hash, nowText(), input.id)
  pushAudit(input.actor, "user_update", `User ${username} diperbarui${input.password ? " dan password diganti" : ""}.`)
  return { ok: true, message: "User berhasil diperbarui.", ...listAuthData() }
}

export function deleteUser(input: { id: string; actor: string }) {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(input.id) as UserRow | undefined
  if (!target) return { ok: false, message: "User tidak ditemukan." }
  if (target.role === "super-admin") {
    const count = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super-admin'").get() as { count: number }).count
    if (count <= 1) return { ok: false, message: "Minimal harus ada satu Super Admin." }
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(input.id)
  pushAudit(input.actor, "user_delete", `User ${target.username} dihapus.`)
  return { ok: true, message: "User berhasil dihapus.", ...listAuthData() }
}
