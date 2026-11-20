import { Fragment, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import {
  Activity,
  Bell,
  ChevronDown,
  Gauge,
  Info,
  LogOut,
  Map,
  Menu,
  Moon,
  Network,
  Settings,
  Shield,
  Sun,
} from "lucide-react"

import { OnuLocationDialog } from "@/components/onu-location-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMonitoring } from "@/context/monitoring-context"
import { useTheme } from "@/hooks/use-theme"
import { getInitials } from "@/lib/monitoring-utils"
import { cn } from "@/lib/utils"
import { authStorageKey, canAccessPath, roleDescriptions, roleLabels, type AuthSession } from "@shared/auth-types"

type NavItem = {
  label: string
  icon: typeof Gauge
  href: string
  group: "Monitoring" | "Administrasi" | "Informasi"
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: Gauge, href: "/", group: "Monitoring" },
  { label: "OLT", icon: Network, href: "/olts", group: "Monitoring" },
  { label: "ONU/ONT", icon: Activity, href: "/onus", group: "Monitoring" },
  { label: "Map ONU", icon: Map, href: "/map", group: "Monitoring" },
  { label: "Alert", icon: Bell, href: "/alerts", group: "Monitoring" },
  { label: "Setting", icon: Settings, href: "/settings", group: "Administrasi" },
  { label: "System", icon: Shield, href: "/system", group: "Administrasi" },
  { label: "About", icon: Info, href: "/about", group: "Informasi" },
]

const titles: Record<string, { title: string; subtitle: string; group: string }> = {
  "/": { title: "Dashboard Monitoring", subtitle: "Ringkasan polling, OLT, ONU/ONT, dan alert", group: "Monitoring" },
  "/olts": { title: "Manajemen OLT", subtitle: "Tambah OLT, test koneksi SNMP, dan poll ONU", group: "Monitoring" },
  "/onus": { title: "Monitoring ONU/ONT", subtitle: "Daftar ONU, sinyal optik, rename, dan set lokasi peta", group: "Monitoring" },
  "/map": { title: "Map ONU", subtitle: "Pemetaan titik perangkat ONU (Hijau Online, Merah Offline)", group: "Monitoring" },
  "/alerts": { title: "Alert", subtitle: "Gangguan dan perubahan status OLT & ONU/ONT", group: "Monitoring" },
  "/settings": { title: "Setting", subtitle: "Pengaturan default peta dan profil OID SNMP", group: "Administrasi" },
  "/system": { title: "System", subtitle: "Manajemen user, role, audit log, startup, dan reset database", group: "Administrasi" },
  "/about": { title: "About", subtitle: "Tentang PingLo", group: "Informasi" },
}

function getAuthSnapshot() {
  return window.localStorage.getItem(authStorageKey) ?? ""
}

function subscribeAuth(cb: () => void) {
  window.addEventListener("storage", cb)
  window.addEventListener("mikroin-auth-change", cb)
  return () => {
    window.removeEventListener("storage", cb)
    window.removeEventListener("mikroin-auth-change", cb)
  }
}

export function AppShell({ children }: { children?: React.ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { darkMode, toggleTheme } = useTheme()
  const authSnapshot = useSyncExternalStore(subscribeAuth, getAuthSnapshot, () => "")
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const { state, openAlertCount, locationDialogOnu, setLocationDialogOnu, saveOnuLocation, clearOnuLocation } = useMonitoring()

  const session = useMemo(() => {
    if (!authSnapshot) return null
    try {
      return JSON.parse(authSnapshot) as AuthSession
    } catch {
      return null
    }
  }, [authSnapshot])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!authSnapshot || !session || !session.expiresAt || Date.now() > session.expiresAt) {
      if (authSnapshot) window.localStorage.removeItem(authStorageKey)
      navigate("/login", { replace: true })
      return
    }
    if (!canAccessPath(session.role, pathname)) {
      navigate("/", { replace: true })
    }
  }, [authSnapshot, pathname, navigate, session])

  function logout() {
    window.localStorage.removeItem(authStorageKey)
    window.dispatchEvent(new Event("mikroin-auth-change"))
    navigate("/login", { replace: true })
  }

  if (!session) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Memeriksa akses...</div>
  }

  const pageMeta = titles[pathname] ?? titles["/"]
  const accessibleNav = navItems.filter((item) => canAccessPath(session.role, item.href))
  const groups = (["Monitoring", "Administrasi", "Informasi"] as const)
    .map((group) => ({ group, items: accessibleNav.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0)

  const renderNavContent = (onNavigate?: () => void) => (
    <>
      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-4">
          {groups.map((section, idx) => (
            <Fragment key={section.group}>
              {idx > 0 && <Separator className="my-2" />}
              <div className="space-y-1">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {section.group}
                </p>
                {section.items.map((item) => {
                  const Icon = item.icon
                  const active = pathname === item.href
                  const showOltBadge = item.href === "/olts" && state.olts.length > 0
                  const showAlertBadge = item.href === "/alerts" && openAlertCount > 0
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {showOltBadge && (
                        <Badge
                          variant={active ? "secondary" : "outline"}
                          className={cn("h-5 px-1.5 text-[10px] tabular-nums", active && "border-transparent bg-white/20 text-sidebar-primary-foreground")}
                        >
                          {state.olts.length}
                        </Badge>
                      )}
                      {showAlertBadge && (
                        <Badge
                          variant={active ? "secondary" : "destructive"}
                          className={cn("h-5 px-1.5 text-[10px] tabular-nums", active && "border-transparent bg-white/20 text-sidebar-primary-foreground")}
                        >
                          {openAlertCount}
                        </Badge>
                      )}
                    </Link>
                  )
                })}
              </div>
            </Fragment>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Collector SNMP Ready
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Storage: node:sqlite lokal</p>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-emerald-400 to-sky-500 text-slate-950 shadow-sm">
            <Network className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="cn-font-heading truncate text-sm font-bold tracking-tight">PingLo</p>
            <p className="truncate text-[11px] text-muted-foreground">SQLite + Map Edition</p>
          </div>
        </div>
        {renderNavContent()}
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="flex h-16 flex-row items-center gap-3 space-y-0 border-b border-sidebar-border px-5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-emerald-400 to-sky-500 text-slate-950 shadow-sm">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="cn-font-heading text-sm font-bold tracking-tight">PingLo</SheetTitle>
              <p className="text-[11px] text-muted-foreground">SQLite + Map Edition</p>
            </div>
          </SheetHeader>
          {renderNavContent(() => setMobileNavOpen(false))}
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu navigasi"
            >
              <Menu className="h-4 w-4" />
            </Button>

            <div className="min-w-0">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden sm:inline-flex">
                    <BreadcrumbLink asChild>
                      <Link to="/">PingLo</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:inline-flex" />
                  <BreadcrumbItem className="hidden md:inline-flex">
                    <span className="text-muted-foreground">{pageMeta.group}</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:inline-flex" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="truncate text-sm">{pageMeta.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{pageMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={toggleTheme} aria-label="Ganti tema">
                  {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{darkMode ? "Mode Terang" : "Mode Gelap"}</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-2 pl-1.5 pr-2.5">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-[10px]">{getInitials(session.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[120px] truncate text-xs font-semibold sm:inline">{session.name}</span>
                  <Badge variant="secondary" className="hidden px-1.5 py-0 text-[10px] md:inline-flex">
                    {roleLabels[session.role]}
                  </Badge>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold leading-none">{session.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        {roleLabels[session.role]}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">@{session.username}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{roleDescriptions[session.role]}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={toggleTheme}>
                  {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
                  <span>{darkMode ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Keluar</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] p-4 lg:p-6">{children ?? <Outlet />}</main>
      </div>

      <OnuLocationDialog
        onu={locationDialogOnu}
        oltName={state.olts.find((o) => o.id === locationDialogOnu?.oltId)?.name ?? "-"}
        mapSettings={state.settings.map}
        open={Boolean(locationDialogOnu)}
        onOpenChange={(open) => !open && setLocationDialogOnu(null)}
        onSave={saveOnuLocation}
        onClear={clearOnuLocation}
      />
    </div>
  )
}
