import { randomUUID } from "node:crypto"
import { chmodSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import { encryptSecret, hashPassword, initSecretKey, legacySha256 } from "./crypto-utils"

function resolveDataDir() {
  const customDir = process.env.PINGLO_DATA_DIR?.trim()
  const targetDir = customDir ? path.resolve(customDir) : path.join(process.cwd(), "data")
  try {
    mkdirSync(targetDir, { recursive: true, mode: 0o700 })
    if (process.platform !== "win32") {
      try {
        chmodSync(targetDir, 0o700)
      } catch {
        // Best-effort on filesystems without POSIX permissions.
      }
    }
    return targetDir
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Direktori data tidak dapat diakses (${targetDir}): ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    const tmpDir = path.join(os.tmpdir(), "pinglo-monitor-data")
    mkdirSync(tmpDir, { recursive: true, mode: 0o700 })
    return tmpDir
  }
}

export const dataDir = resolveDataDir()
initSecretKey(dataDir)

export const dbPath = path.join(dataDir, "mikroin-monitor.db")
export const db = new DatabaseSync(dbPath)

if (process.platform !== "win32") {
  try {
    chmodSync(dbPath, 0o600)
  } catch {
    // Best-effort on restricted filesystems.
  }
}

db.exec("PRAGMA journal_mode = WAL;")
db.exec("PRAGMA foreign_keys = ON;")

export { hashPassword }

export function runTransaction<T>(fn: () => T): T {
  db.exec("BEGIN")
  try {
    const result = fn()
    db.exec("COMMIT")
    return result
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

export const defaultMapSettings = {
  defaultLat: -2.9761,
  defaultLng: 104.7754,
  defaultZoom: 12,
}

function nowText() {
  return new Date().toLocaleString("id-ID")
}

/** Appends a bounded security/operational audit record (retaining the latest 1,000 entries). */
export function recordAuditLog(actor: string, action: string, detail: string) {
  const cleanActor = (actor || "system").slice(0, 64)
  const cleanAction = action.slice(0, 64)
  const cleanDetail = detail.slice(0, 500)
  const now = Date.now()
  db.prepare(`INSERT INTO audit_logs (id, actor, action, detail, created_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(`audit-${now}-${randomUUID()}`, cleanActor, cleanAction, cleanDetail, nowText(), now)
  db.prepare(`DELETE FROM audit_logs WHERE id NOT IN (SELECT id FROM audit_logs ORDER BY sort_order DESC LIMIT 1000)`).run()
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'super-admin')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '-',
      user_agent TEXT NOT NULL DEFAULT '-',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS olts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      vendor TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '-',
      location TEXT NOT NULL DEFAULT '-',
      status TEXT NOT NULL DEFAULT 'offline',
      uptime TEXT NOT NULL DEFAULT '-',
      cpu_load REAL NOT NULL DEFAULT 0,
      memory_load REAL NOT NULL DEFAULT 0,
      pon_ports INTEGER NOT NULL DEFAULT 0,
      active_onu INTEGER NOT NULL DEFAULT 0,
      polling_interval INTEGER NOT NULL DEFAULT 60,
      snmp_version TEXT NOT NULL DEFAULT 'v2c',
      snmp_port INTEGER NOT NULL DEFAULT 161,
      read_community TEXT NOT NULL,
      write_community TEXT DEFAULT '',
      oid_profile TEXT NOT NULL DEFAULT 'vsol-gpon',
      write_mode TEXT NOT NULL DEFAULT 'none',
      last_seen TEXT NOT NULL DEFAULT 'Belum pernah dipolling',
      system_info TEXT
    );
    CREATE TABLE IF NOT EXISTS onus (
      id TEXT PRIMARY KEY,
      olt_id TEXT NOT NULL,
      name TEXT NOT NULL,
      serial_number TEXT NOT NULL DEFAULT '-',
      pon_port TEXT NOT NULL DEFAULT '-',
      onu_index TEXT NOT NULL DEFAULT '-',
      status TEXT NOT NULL DEFAULT 'offline',
      rx_power REAL NOT NULL DEFAULT 0,
      tx_power REAL NOT NULL DEFAULT 0,
      temperature_c REAL,
      down_reason TEXT,
      distance_meters REAL NOT NULL DEFAULT 0,
      last_seen TEXT NOT NULL DEFAULT 'Baru saja',
      sync_status TEXT NOT NULL DEFAULT 'synced',
      latitude REAL,
      longitude REAL,
      location_note TEXT,
      location_updated_at TEXT,
      FOREIGN KEY (olt_id) REFERENCES olts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_onus_olt_id ON onus(olt_id);
    CREATE INDEX IF NOT EXISTS idx_onus_coords ON onus(latitude, longitude);
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      olt_id TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      severity TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_olt_id ON alerts(olt_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const userCols = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>
  if (!userCols.some((c) => c.name === "must_change_password")) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;")
  }

  const userCount = (db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number }).count
  if (userCount === 0) {
    const createdAt = nowText()
    const envSuper = process.env.PINGLO_BOOTSTRAP_SUPERADMIN_PASSWORD?.trim()
    const envAdmin = process.env.PINGLO_BOOTSTRAP_ADMIN_PASSWORD?.trim()
    const superPass = envSuper && envSuper.length >= 8 ? envSuper : "superadmin123"
    const adminPass = envAdmin && envAdmin.length >= 8 ? envAdmin : "admin123"
    const superMustChange = envSuper && envSuper.length >= 8 ? 0 : 1
    const adminMustChange = envAdmin && envAdmin.length >= 8 ? 0 : 1

    const ins = db.prepare(
      `INSERT INTO users (id, username, password_hash, name, role, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    runTransaction(() => {
      ins.run("user-super-admin", "superadmin", hashPassword(superPass), "Super Admin", "super-admin", superMustChange, createdAt, createdAt)
      ins.run("user-admin", "admin", hashPassword(adminPass), "Admin", "admin", adminMustChange, createdAt, createdAt)
      recordAuditLog("system", "init", "Default akun lokal dibuat di SQLite dengan hashing scrypt.")
    })
  } else {
    const legacyDefaultHashes = new Set([legacySha256("superadmin123"), legacySha256("admin123")])
    const existingUsers = db.prepare("SELECT id, password_hash, must_change_password FROM users").all() as Array<{
      id: string
      password_hash: string
      must_change_password: number
    }>
    for (const u of existingUsers) {
      if (legacyDefaultHashes.has(u.password_hash) && !u.must_change_password) {
        db.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").run(u.id)
      }
    }
  }

  const oltSecrets = db.prepare("SELECT id, read_community, write_community FROM olts").all() as Array<{
    id: string
    read_community: string
    write_community: string | null
  }>
  const needsEncrypt = oltSecrets.filter(
    (o) =>
      (o.read_community && !o.read_community.startsWith("enc:v1:")) ||
      (o.write_community && !o.write_community.startsWith("enc:v1:")),
  )
  if (needsEncrypt.length > 0) {
    const stmt = db.prepare("UPDATE olts SET read_community = ?, write_community = ? WHERE id = ?")
    runTransaction(() => {
      for (const o of needsEncrypt) {
        stmt.run(encryptSecret(o.read_community), encryptSecret(o.write_community ?? ""), o.id)
      }
    })
  }

  if (!db.prepare("SELECT value FROM settings WHERE key = 'map'").get()) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('map', ?)").run(JSON.stringify(defaultMapSettings))
  }
}

initDatabase()
