export type AppRole = "admin" | "super-admin"

export type AuthSession = {
  id: string
  username: string
  name: string
  role: AppRole
  expiresAt: number
  mustChangePassword?: boolean
}

export type PublicUser = {
  id: string
  username: string
  name: string
  role: AppRole
  createdAt: string
  updatedAt: string
}

export type AuthAuditLog = {
  id: string
  actor: string
  action: string
  detail: string
  createdAt: string
}

export const authStorageKey = "mikroin-auth-session"
export const sessionDurationMs = 8 * 60 * 60 * 1000

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  "super-admin": "Super Admin",
}

export const roleDescriptions: Record<AppRole, string> = {
  admin: "Bisa mengakses Dashboard, monitoring OLT (poll & test), ONU/ONT (rename & peta), Map ONU, Alert, dan About.",
  "super-admin": "Akses penuh seluruh fitur termasuk tambah/edit/hapus OLT, Setting, Manajemen User, System, dan Reset Database.",
}

export function canAccessPath(role: AppRole, pathname: string) {
  if (role === "super-admin") return true

  return (
    pathname === "/" ||
    pathname.startsWith("/olts") ||
    pathname.startsWith("/onus") ||
    pathname.startsWith("/map") ||
    pathname.startsWith("/alerts") ||
    pathname.startsWith("/about")
  )
}
