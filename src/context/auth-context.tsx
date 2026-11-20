import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { apiFetch } from "@/lib/api"
import { authStorageKey, type AuthSession } from "@shared/auth-types"

type AuthContextValue = {
  session: AuthSession | null
  authLoading: boolean
  isSuperAdmin: boolean
  setSession: (session: AuthSession | null) => void
  refreshSession: () => Promise<AuthSession | null>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; message: string }>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/me")
      if (!res.ok) {
        setSession(null)
        return null
      }
      const data = (await res.json()) as { ok?: boolean; session?: AuthSession }
      const next = data.ok && data.session ? data.session : null
      setSession(next)
      return next
    } catch {
      setSession(null)
      return null
    }
  }, [])

  useEffect(() => {
    window.localStorage.removeItem(authStorageKey)
    let active = true
    refreshSession().finally(() => {
      if (active) setAuthLoading(false)
    })

    const onExpired = () => setSession(null)
    window.addEventListener("pinglo-auth-expired", onExpired)
    return () => {
      active = false
      window.removeEventListener("pinglo-auth-expired", onExpired)
    }
  }, [refreshSession])

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" })
    } finally {
      window.localStorage.removeItem(authStorageKey)
      setSession(null)
    }
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = (await res.json()) as { ok: boolean; message: string; session?: AuthSession }
      if (data.ok && data.session) {
        setSession(data.session)
      }
      return { ok: data.ok, message: data.message }
    } catch {
      return { ok: false, message: "Gagal menghubungi server untuk mengganti password." }
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      authLoading,
      isSuperAdmin: session?.role === "super-admin",
      setSession,
      refreshSession,
      logout,
      changePassword,
    }),
    [session, authLoading, refreshSession, logout, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth harus dipanggil di dalam AuthProvider")
  return ctx
}
