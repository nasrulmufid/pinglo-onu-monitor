import { useEffect, useMemo, useState } from "react"
import { Copy, FileClock, Pencil, Save, Search, Shield, ShieldAlert, Terminal, Trash2, UserCog, UserPlus, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMonitoring } from "@/context/monitoring-context"
import { getInitials } from "@/lib/monitoring-utils"
import {
  authStorageKey,
  roleDescriptions,
  roleLabels,
  type AppRole,
  type AuthAuditLog,
  type AuthSession,
  type PublicUser,
} from "@shared/auth-types"
import type { StartupStatus } from "@shared/types"

export function SystemView() {
  const { resetDefault } = useMonitoring()

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<PublicUser[]>([])
  const [logs, setLogs] = useState<AuthAuditLog[]>([])
  const [startup, setStartup] = useState<StartupStatus | null>(null)
  const [logQuery, setLogQuery] = useState("")

  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "admin" as AppRole })
  const [savingUser, setSavingUser] = useState(false)
  const [deleteUserTarget, setDeleteUserTarget] = useState<PublicUser | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch("/api/auth/users").then((r) => r.json() as Promise<{ users: PublicUser[]; auditLogs: AuthAuditLog[] }>),
      fetch("/api/system/startup").then((r) => r.json() as Promise<StartupStatus>),
    ])
      .then(([authData, startupData]) => {
        if (!active) return
        setUsers(authData.users)
        setLogs(authData.auditLogs)
        setStartup(startupData)
      })
      .catch(() => {
        if (active) toast.error("Gagal memuat data sistem.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  function actor() {
    try {
      return (JSON.parse(window.localStorage.getItem(authStorageKey) || "{}") as AuthSession).username || "admin"
    } catch {
      return "admin"
    }
  }

  async function saveUser() {
    setSavingUser(true)
    try {
      const res = await fetch("/api/auth/users", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editingId ?? "", actor: actor() }),
      })
      const d = (await res.json()) as { ok: boolean; message: string; users?: PublicUser[]; auditLogs?: AuthAuditLog[] }
      if (d.users) setUsers(d.users)
      if (d.auditLogs) setLogs(d.auditLogs)
      if (d.ok) {
        toast.success(d.message)
        setEditingId(null)
        setForm({ username: "", name: "", password: "", role: "admin" })
      } else {
        toast.error(d.message)
      }
    } finally {
      setSavingUser(false)
    }
  }

  async function removeUser(u: PublicUser) {
    const res = await fetch("/api/auth/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, actor: actor() }),
    })
    const d = (await res.json()) as { ok: boolean; message: string; users?: PublicUser[]; auditLogs?: AuthAuditLog[] }
    if (d.users) setUsers(d.users)
    if (d.auditLogs) setLogs(d.auditLogs)
    if (d.ok) toast.success(d.message)
    else toast.error(d.message)
  }

  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase()
    if (!q) return logs
    return logs.filter((l) => `${l.action} ${l.actor} ${l.detail} ${l.createdAt}`.toLowerCase().includes(q))
  }, [logs, logQuery])

  function copyCommands(commands: string[], label: string) {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(commands.join("\n"))
      toast.success(`${label} disalin ke clipboard.`)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    )
  }

  return (
    <Tabs defaultValue="users" className="space-y-4">
      <TabsList className="h-auto flex-wrap justify-start gap-1">
        <TabsTrigger value="users">
          <UserCog className="h-3.5 w-3.5" />
          User &amp; Role
        </TabsTrigger>
        <TabsTrigger value="audit">
          <FileClock className="h-3.5 w-3.5" />
          Audit Log
          <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
            {logs.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="startup">
          <Terminal className="h-3.5 w-3.5" />
          Startup Service
        </TabsTrigger>
        <TabsTrigger value="danger">
          <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
          Database &amp; Reset
        </TabsTrigger>
      </TabsList>

      <TabsContent value="users">
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Akun Pengguna ({users.length})</CardTitle>
              <CardDescription>Kelola hak akses Admin dan Super Admin untuk PingLo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {users.map((u) => (
                <div key={u.id} className="flex flex-col justify-between rounded-xl border bg-card p-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>{getInitials(u.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{u.name}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">@{u.username}</p>
                        </div>
                      </div>
                      <Badge variant={u.role === "super-admin" ? "info" : "outline"} className="shrink-0 text-[11px]">
                        {roleLabels[u.role]}
                      </Badge>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{roleDescriptions[u.role]}</p>
                  </div>

                  <div className="mt-4 flex gap-2 border-t pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setEditingId(u.id)
                        setForm({ username: u.username, name: u.name, password: "", role: u.role })
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteUserTarget(u)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                {editingId ? "Edit User" : "Tambah User Baru"}
              </CardTitle>
              <CardDescription>
                {editingId ? "Perbarui informasi atau ganti role pengguna." : "Buat akun login baru untuk teknisi atau administrator."}
              </CardDescription>
            </CardHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void saveUser()
              }}
            >
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sys-username">Username</Label>
                  <Input
                    id="sys-username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="operator1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sys-name">Nama Lengkap</Label>
                  <Input
                    id="sys-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Teknisi NOC"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sys-pass">Password {editingId ? "(opsional)" : ""}</Label>
                  <Input
                    id="sys-pass"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? "Kosongkan jika tidak diubah" : "Minimal 4 karakter"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super-admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1" disabled={savingUser}>
                    <Save className="h-4 w-4" />
                    {savingUser ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan User"}
                  </Button>
                  {editingId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingId(null)
                        setForm({ username: "", name: "", password: "", role: "admin" })
                      }}
                    >
                      Batal
                    </Button>
                  )}
                </div>
              </CardContent>
            </form>
          </Card>
        </div>

        <AlertDialog open={Boolean(deleteUserTarget)} onOpenChange={(open) => !open && setDeleteUserTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus user @{deleteUserTarget?.username}?</AlertDialogTitle>
              <AlertDialogDescription>
                Akun <b>{deleteUserTarget?.name}</b> tidak akan bisa lagi masuk ke PingLo. Tindakan ini dicatat dalam audit log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (deleteUserTarget) void removeUser(deleteUserTarget)
                  setDeleteUserTarget(null)
                }}
              >
                Ya, Hapus User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TabsContent>

      <TabsContent value="audit">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Audit Log Aktivitas</CardTitle>
              <CardDescription>Riwayat perubahan user, login, dan aktivitas administrasi.</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-8"
                placeholder="Cari log..."
                value={logQuery}
                onChange={(e) => setLogQuery(e.target.value)}
              />
              {logQuery && (
                <button
                  type="button"
                  onClick={() => setLogQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Hapus pencarian"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[420px] rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Aksi</TableHead>
                    <TableHead>Aktor</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Tidak ada catatan audit log.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLogs.slice(0, 50).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{l.createdAt}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">
                            {l.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium">@{l.actor}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.detail}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="startup">
        {startup ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    Panduan Startup Service
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Perintah konfigurasi layanan background agar PingLo berjalan otomatis saat boot.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{startup.platform}</Badge>
                  <Badge variant={startup.enabled ? "success" : "secondary"}>
                    {startup.enabled ? "Terdeteksi Aktif" : "Belum Terpasang"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Service Path: <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground">{startup.servicePath}</code>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Perintah Aktivasi Startup</p>
                  <Button size="sm" variant="outline" onClick={() => copyCommands(startup.commands, "Perintah aktivasi")}>
                    <Copy className="h-3.5 w-3.5" />
                    Salin
                  </Button>
                </div>
                <ScrollArea className="max-h-56 rounded-xl border bg-slate-950 p-3">
                  <pre className="font-mono text-xs leading-relaxed text-emerald-300">{startup.commands.join("\n")}</pre>
                </ScrollArea>
              </div>

              {startup.disableCommands.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold">Perintah Nonaktifkan Startup</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyCommands(startup.disableCommands, "Perintah nonaktif")}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Salin
                      </Button>
                    </div>
                    <ScrollArea className="max-h-44 rounded-xl border bg-slate-950 p-3">
                      <pre className="font-mono text-xs leading-relaxed text-amber-300">{startup.disableCommands.join("\n")}</pre>
                    </ScrollArea>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">Informasi startup tidak tersedia.</Card>
        )}
      </TabsContent>

      <TabsContent value="danger">
        <div className="space-y-4">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Zona Berbahaya — Reset Database Monitoring</AlertTitle>
            <AlertDescription>
              Tindakan ini akan menghapus seluruh daftar OLT, ONU/ONT, titik koordinat peta, dan riwayat alert di SQLite. Akun pengguna login tetap aman tersimpan.
            </AlertDescription>
          </Alert>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">Reset Default Database</CardTitle>
              <CardDescription>
                Kosongkan data monitoring ke keadaan awal untuk memulai konfigurasi dari nol.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Reset Default Sekarang
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset seluruh database monitoring?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Semua OLT, ONU/ONT, lokasi peta, dan alert di SQLite akan dikosongkan permanen. Akun login pengguna tidak akan dihapus.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => void resetDefault()}
                    >
                      Ya, Reset Database
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  )
}
