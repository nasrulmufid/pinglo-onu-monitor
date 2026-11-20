import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Activity,
  CircleAlert,
  Database,
  Eye,
  EyeOff,
  Info,
  LockKeyhole,
  MapPin,
  Moon,
  Network,
  ShieldCheck,
  Sun,
} from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTheme } from "@/hooks/use-theme"
import { authStorageKey, type AuthSession } from "@shared/auth-types"

const features = [
  {
    icon: Activity,
    title: "Multi-Vendor SNMP",
    desc: "Polling cepat untuk VSOL GPON, HSGQ GPON/EPON, dan profil Generic SNMP.",
  },
  {
    icon: MapPin,
    title: "Peta ONU Real-Time",
    desc: "Visualisasi koordinat pelanggan di mode Satelit maupun OpenStreetMap.",
  },
  {
    icon: Database,
    title: "SQLite Lokal",
    desc: "Penyimpanan persisten bawaan Node.js tanpa ketergantungan database eksternal.",
  },
]

export function LoginForm() {
  const navigate = useNavigate()
  const { darkMode, toggleTheme } = useTheme()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [message, setMessage] = useState("Masuk untuk membuka dashboard monitoring.")

  useEffect(() => {
    if (window.localStorage.getItem(authStorageKey)) navigate("/", { replace: true })
  }, [navigate])

  async function login() {
    if (loading || !username.trim() || !password) return
    setLoading(true)
    setHasError(false)
    setMessage("Memeriksa akses...")
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const result = (await res.json()) as { ok: boolean; message: string; session?: AuthSession }
      if (!result.ok || !result.session) {
        setHasError(true)
        setMessage(result.message)
        return
      }
      window.localStorage.setItem(authStorageKey, JSON.stringify(result.session))
      window.dispatchEvent(new Event("mikroin-auth-change"))
      toast.success("Login berhasil")
      navigate("/", { replace: true })
    } catch {
      setHasError(true)
      setMessage("Login belum bisa diproses. Pastikan server backend aktif.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="bg-dot-grid relative grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-emerald-500/5" />

      <div className="absolute right-4 top-4 z-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" onClick={toggleTheme} aria-label="Ganti tema">
              {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{darkMode ? "Mode Terang" : "Mode Gelap"}</TooltipContent>
        </Tooltip>
      </div>

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.15fr_420px]">
        <div className="hidden space-y-6 lg:block">
          <div className="inline-flex items-center gap-3 rounded-2xl border bg-card/90 px-4 py-2.5 shadow-sm backdrop-blur">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-emerald-400 to-sky-500 text-slate-950">
              <Network className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="cn-font-heading text-sm font-bold">PingLo</p>
                <Badge variant="info" className="text-[10px]">
                  NOC Edition
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">OLT &amp; ONU Operations Center</p>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="cn-font-heading text-3xl font-bold tracking-tight xl:text-4xl">
              Pantau OLT, ONU/ONT, dan Peta Lokasi dalam satu dashboard.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Kelola perangkat jaringan optik Anda secara real-time dengan pemantauan sinyal RX, notifikasi gangguan otomatis, dan pemetaan geografis terintegrasi.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {features.map((item) => {
              const Icon = item.icon
              return (
                <Card key={item.title} className="bg-card/85 backdrop-blur">
                  <CardContent className="p-4">
                    <div className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-semibold">{item.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        <Card className="border-border/80 shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg">Masuk ke Sistem</CardTitle>
              <CardDescription className="mt-1">Gunakan akun PingLo Anda.</CardDescription>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-sky-500 text-slate-950 shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </span>
          </CardHeader>

          <Separator />

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void login()
            }}
          >
            <CardContent className="space-y-4 pt-5">
              <div className="space-y-1.5">
                <Label htmlFor="login-username">Username</Label>
                <Input
                  id="login-username"
                  className="h-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="admin / superadmin"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    className="h-10 pr-10"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Masukkan password"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Button type="submit" className="h-10 w-full" disabled={loading || !username.trim() || !password}>
                <LockKeyhole className="h-4 w-4" />
                {loading ? "Memeriksa..." : "Masuk Dashboard"}
              </Button>
            </CardContent>
          </form>

          <CardFooter className="pt-0">
            <Alert variant={hasError ? "destructive" : "info"} className="p-3">
              {hasError ? <CircleAlert className="h-4 w-4" /> : <Info className="h-4 w-4" />}
              <AlertTitle className="text-xs">{hasError ? "Gagal Masuk" : "Status Akses"}</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
