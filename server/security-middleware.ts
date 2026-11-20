import type { NextFunction, Request, Response } from "express"

import type { AppRole, AuthSession } from "../shared/auth-types"
import { getSessionByToken } from "./auth-service"

declare module "express-serve-static-core" {
  interface Request {
    authUser?: AuthSession
    sessionToken?: string
  }
}

export const SESSION_COOKIE_NAME = "pinglo_session"

const DEV_ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

function getAllowedOrigins(): Set<string> {
  const envOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const origins = new Set<string>(envOrigins)
  if (process.env.NODE_ENV !== "production") {
    for (const devOrigin of DEV_ALLOWED_ORIGINS) origins.add(devOrigin)
  }
  return origins
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  const result: Record<string, string> = {}
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=")
    if (idx <= 0) continue
    const key = part.slice(0, idx).trim()
    const rawVal = part.slice(idx + 1).trim()
    try {
      result[key] = decodeURIComponent(rawVal)
    } catch {
      result[key] = rawVal
    }
  }
  return result
}

function shouldUseSecureCookie(req: Request): boolean {
  if (process.env.COOKIE_SECURE === "true") return true
  if (process.env.COOKIE_SECURE === "false") return false
  return Boolean(req.secure || req.headers["x-forwarded-proto"] === "https")
}

export function setSessionCookie(req: Request, res: Response, token: string, maxAgeMs: number): void {
  const maxAgeSec = Math.max(60, Math.floor(maxAgeMs / 1000))
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSec}`,
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (shouldUseSecureCookie(req)) parts.push("Secure")
  res.setHeader("Set-Cookie", parts.join("; "))
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [`${SESSION_COOKIE_NAME}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"]
  if (shouldUseSecureCookie(req)) parts.push("Secure")
  res.setHeader("Set-Cookie", parts.join("; "))
}

export function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "-"
}

/** Applies strict HTTP security headers and Content-Security-Policy across responses. */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.google.com https://*.googleapis.com https://server.arcgisonline.com https://*.tile.openstreetmap.org",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  )
  next()
}

/** Explicit origin allowlist CORS middleware (no wildcard `*`). */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin
  if (origin) {
    const allowed = getAllowedOrigins()
    const host = req.get("host")
    const isSameHost = Boolean(host && (origin === `${req.protocol}://${host}` || origin === `http://${host}` || origin === `https://${host}`))
    if (allowed.has(origin) || isSameHost) {
      res.setHeader("Access-Control-Allow-Origin", origin)
      res.setHeader("Access-Control-Allow-Credentials", "true")
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
      res.setHeader("Access-Control-Allow-Headers", "Content-Type")
      res.setHeader("Vary", "Origin")
    }
  }
  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  next()
}

/** Verifies same-origin or explicit allowlist on state-changing `/api/*` requests. */
export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.originalUrl.startsWith("/api")) {
    next()
    return
  }
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next()
    return
  }

  const host = req.get("host")
  const allowed = getAllowedOrigins()
  const isOriginAllowed = (candidate: string) => {
    if (allowed.has(candidate)) return true
    if (!host) return false
    return candidate === `${req.protocol}://${host}` || candidate === `http://${host}` || candidate === `https://${host}`
  }

  const origin = req.headers.origin
  if (origin) {
    if (!isOriginAllowed(origin)) {
      res.status(403).json({ ok: false, message: "Permintaan lintas origin ditolak." })
      return
    }
    next()
    return
  }

  const referer = req.headers.referer
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin
      if (!isOriginAllowed(refOrigin)) {
        res.status(403).json({ ok: false, message: "Referer permintaan tidak diizinkan." })
        return
      }
    } catch {
      res.status(403).json({ ok: false, message: "Referer permintaan tidak valid." })
      return
    }
  }

  next()
}

/** Sliding-window in-memory rate limiter for sensitive endpoints. */
export function createRateLimiter(options: {
  windowMs: number
  max: number
  keyFn?: (req: Request) => string
  message?: string
}) {
  const buckets = new Map<string, number[]>()
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - options.windowMs
    for (const [key, timestamps] of buckets.entries()) {
      const recent = timestamps.filter((t) => t > cutoff)
      if (recent.length === 0) buckets.delete(key)
      else buckets.set(key, recent)
    }
  }, Math.min(options.windowMs, 5 * 60 * 1000))
  cleanup.unref()

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    const cutoff = now - options.windowMs
    const key = options.keyFn ? options.keyFn(req) : getClientIp(req)
    const timestamps = (buckets.get(key) ?? []).filter((t) => t > cutoff)

    if (timestamps.length >= options.max) {
      const retrySec = Math.max(1, Math.ceil((timestamps[0] + options.windowMs - now) / 1000))
      res.setHeader("Retry-After", String(retrySec))
      res.status(429).json({
        ok: false,
        message: options.message ?? `Terlalu banyak permintaan. Coba lagi dalam ${retrySec} detik.`,
      })
      return
    }

    timestamps.push(now)
    buckets.set(key, timestamps)
    next()
  }
}

/** Requires a valid server-side session cookie before continuing. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie)
  const token = cookies[SESSION_COOKIE_NAME]
  const session = token ? getSessionByToken(token) : null
  if (!session) {
    res.status(401).json({ ok: false, message: "Sesi tidak valid atau telah berakhir. Silakan login kembali." })
    return
  }
  req.authUser = session
  req.sessionToken = token
  next()
}

/** Restricts access to specific user roles (must follow `requireAuth`). */
export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ ok: false, message: "Autentikasi diperlukan." })
      return
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ ok: false, message: "Akses ditolak. Role Anda tidak memiliki izin untuk aksi ini." })
      return
    }
    next()
  }
}
