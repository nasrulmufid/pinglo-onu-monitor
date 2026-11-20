import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const
const SCRYPT_KEYLEN = 64

let cachedMasterKey: Buffer | null = null

/**
 * Initializes the 32-byte AES-256-GCM master key from `PINGLO_ENCRYPTION_KEY`
 * or a local `data/.master.key` file with strict permissions.
 */
export function initSecretKey(dataDir: string): void {
  const envKey = process.env.PINGLO_ENCRYPTION_KEY?.trim()
  if (envKey) {
    cachedMasterKey = createHash("sha256").update(envKey).digest()
    return
  }

  const keyPath = path.join(dataDir, ".master.key")
  if (existsSync(keyPath)) {
    const raw = readFileSync(keyPath, "utf8").trim()
    if (/^[a-f0-9]{64}$/i.test(raw)) {
      cachedMasterKey = Buffer.from(raw, "hex")
      return
    }
    if (raw.length > 0) {
      cachedMasterKey = createHash("sha256").update(raw).digest()
      return
    }
  }

  const rawHex = randomBytes(32).toString("hex")
  try {
    writeFileSync(keyPath, `${rawHex}\n`, { encoding: "utf8", mode: 0o600 })
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : ""
    if (code === "EACCES" || code === "EPERM") {
      throw new Error(
        `Tidak memiliki izin menulis ke ${keyPath}. Pastikan folder data dimiliki user container (mis. chown -R 1000:1000 ./data) atau set environment variable PINGLO_ENCRYPTION_KEY.`,
      )
    }
    throw error
  }
  if (process.platform !== "win32") {
    try {
      chmodSync(keyPath, 0o600)
    } catch {
      // Best-effort on filesystems that do not honor POSIX chmod.
    }
  }
  cachedMasterKey = Buffer.from(rawHex, "hex")
}

function getMasterKey(): Buffer {
  if (!cachedMasterKey) {
    throw new Error("Kunci enkripsi server belum diinisialisasi.")
  }
  return cachedMasterKey
}

/** Hashes a password with a per-user 16-byte random salt using scrypt. */
export function hashPassword(password: string): string {
  const saltHex = randomBytes(16).toString("hex")
  const derivedHex = scryptSync(password, saltHex, SCRYPT_KEYLEN, SCRYPT_OPTIONS).toString("hex")
  return `scrypt$${saltHex}$${derivedHex}`
}

/** Computes legacy unsalted SHA-256 hex digest solely for migrating old user records. */
export function legacySha256(password: string): string {
  return createHash("sha256").update(password).digest("hex")
}

/**
 * Verifies a plaintext password in constant time against either `scrypt$...`
 * or legacy SHA-256 hashes (signaling `needsRehash` for transparent upgrade).
 */
export function verifyPassword(password: string, storedHash: string): { valid: boolean; needsRehash: boolean } {
  if (!storedHash) return { valid: false, needsRehash: false }

  if (storedHash.startsWith("scrypt$")) {
    const parts = storedHash.split("$")
    if (parts.length !== 3 || !parts[1] || !parts[2]) return { valid: false, needsRehash: false }
    try {
      const expected = Buffer.from(parts[2], "hex")
      if (expected.length === 0) return { valid: false, needsRehash: false }
      const actual = scryptSync(password, parts[1], expected.length, SCRYPT_OPTIONS)
      const valid = expected.length === actual.length && timingSafeEqual(expected, actual)
      return { valid, needsRehash: false }
    } catch {
      return { valid: false, needsRehash: false }
    }
  }

  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const expected = Buffer.from(storedHash, "hex")
    const actual = createHash("sha256").update(password).digest()
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual)
    return { valid, needsRehash: valid }
  }

  return { valid: false, needsRehash: false }
}

/** Generates a 256-bit cryptographically random session token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex")
}

/** Hashes a session token with SHA-256 before storing or querying SQLite. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Encrypts a sensitive string (e.g., SNMP community) using AES-256-GCM. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ""
  if (plaintext.startsWith("enc:v1:")) return plaintext
  const key = getMasterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

/** Decrypts an `enc:v1:...` secret or passes through legacy plaintext values. */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return ""
  if (!stored.startsWith("enc:v1:")) return stored
  const parts = stored.split(":")
  if (parts.length !== 5) return ""
  try {
    const iv = Buffer.from(parts[2], "hex")
    const tag = Buffer.from(parts[3], "hex")
    const data = Buffer.from(parts[4], "hex")
    const decipher = createDecipheriv("aes-256-gcm", getMasterKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  } catch {
    return ""
  }
}
