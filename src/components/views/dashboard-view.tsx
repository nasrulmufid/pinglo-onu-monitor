import { useState } from "react"
import { Link } from "react-router-dom"
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  MapPin,
  Network,
  RefreshCcw,
  Server,
  Thermometer,
  WifiOff,
} from "lucide-react"

import { MetricCard } from "@/components/metric-card"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMonitoring } from "@/context/monitoring-context"
import { cn } from "@/lib/utils"

export function DashboardView() {
  const {
    state,
    loading,
    notice,
    pollingOltId,
    operationalAlerts,
    openAlertCount,
    onlineOltCount,
    onlineOnuCount,
    downOnuCount,
    mappedOnuCount,
    weakRxCount,
    highTempCount,
    pollOnu,
  } = useMonitoring()

  const [alertTab, setAlertTab] = useState<"all" | "open">("all")
  const { olts, onus } = state

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="space-y-2">
              <Skeleton className="h-5 w-44 rounded-full" />
              <Skeleton className="h-7 w-64 sm:w-72" />
              <Skeleton className="h-4 w-52 sm:w-56" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Skeleton className="col-span-2 h-9 w-full sm:col-span-1 sm:w-32" />
              <Skeleton className="h-9 w-full sm:w-28" />
              <Skeleton className="h-9 w-full sm:w-24" />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-3.5 sm:p-5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-xl sm:h-10 sm:w-10" />
                <Skeleton className="h-4 w-20 sm:w-24" />
              </div>
              <Skeleton className="mt-3 h-7 w-16 sm:mt-4 sm:h-8 sm:w-20" />
              <Skeleton className="mt-3 h-1.5 w-full" />
              <Skeleton className="mt-2.5 h-3 w-full sm:w-40" />
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="p-5 xl:col-span-7">
            <Skeleton className="h-5 w-56" />
            <div className="mt-5 grid gap-5 sm:grid-cols-[164px_1fr]">
              <Skeleton className="mx-auto h-36 w-36 rounded-full" />
              <div className="space-y-3">
                <Skeleton className="h-3 w-full rounded-full" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-5 xl:col-span-5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="mt-4 h-10 w-36" />
            <Skeleton className="mt-3 h-2.5 w-full" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
            <Skeleton className="mt-4 h-9 w-full rounded-lg" />
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
          <Card className="p-5">
            <Skeleton className="h-5 w-40" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <Skeleton className="h-5 w-32" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const oltRatio = olts.length ? Math.round((onlineOltCount / olts.length) * 100) : 0
  const onuOnlineRatio = onus.length ? Math.round((onlineOnuCount / onus.length) * 100) : 0
  const mapCoverageRatio = onus.length ? Math.round((mappedOnuCount / onus.length) * 100) : 0
  const downRatio = onus.length ? Math.round((downOnuCount / onus.length) * 100) : 0

  const optimalOnuCount = Math.max(0, onlineOnuCount - weakRxCount)
  const unmappedCount = Math.max(0, onus.length - mappedOnuCount)
  const optimalPct = onus.length ? (optimalOnuCount / onus.length) * 100 : 0
  const weakRxPct = onus.length ? (weakRxCount / onus.length) * 100 : 0
  const downPct = onus.length ? (downOnuCount / onus.length) * 100 : 0

  const ringRadius = 52
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringOffset = ringCircumference - (onuOnlineRatio / 100) * ringCircumference

  const isHealthy = openAlertCount === 0 && downOnuCount === 0
  const visibleAlerts = (alertTab === "open" ? operationalAlerts.filter((a) => !a.acknowledged) : operationalAlerts).slice(0, 8)

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden bg-gradient-to-r from-card via-card to-primary/[0.07]">
        <div className="bg-dot-grid pointer-events-none absolute inset-y-0 right-0 w-72 opacity-40 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_75%)]" />
        <CardContent className="relative flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1 text-xs font-medium backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    isHealthy ? "bg-emerald-400" : "bg-amber-400",
                  )}
                />
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", isHealthy ? "bg-emerald-500" : "bg-amber-500")} />
              </span>
              <span className={isHealthy ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                {isHealthy ? "Semua Sistem Normal" : `${openAlertCount} Gangguan Perlu Perhatian`}
              </span>
            </div>
            <h2 className="cn-font-heading text-lg font-bold tracking-tight sm:text-2xl">Ringkasan Operasional Jaringan</h2>
            <p className="text-xs text-muted-foreground">{notice}</p>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Button
              size="sm"
              className="col-span-2 sm:col-span-1"
              disabled={olts.length === 0 || Boolean(pollingOltId)}
              onClick={() => olts.forEach((o) => void pollOnu(o))}
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", pollingOltId && "animate-spin")} />
              {pollingOltId ? "Polling..." : "Poll Semua OLT"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/olts">
                <Server className="h-3.5 w-3.5" />
                Kelola OLT
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/map">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Buka Peta
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          label="OLT Online"
          value={String(onlineOltCount)}
          subValue={`/ ${olts.length}`}
          badge={`${oltRatio}%`}
          badgeVariant={oltRatio === 100 && olts.length > 0 ? "success" : "info"}
          detail="Berdasarkan polling SNMP terakhir"
          tone="cyan"
          icon={Network}
          progress={oltRatio}
          href="/olts"
        />
        <MetricCard
          label="ONU Aktif"
          value={String(onlineOnuCount)}
          subValue={`/ ${onus.length}`}
          badge={`${onuOnlineRatio}%`}
          badgeVariant="success"
          detail={`${mappedOnuCount} sudah terpetakan di peta`}
          tone="emerald"
          icon={Activity}
          progress={onuOnlineRatio}
          href="/onus"
        />
        <MetricCard
          label="ONU Down / LOS"
          value={String(downOnuCount)}
          badge={downOnuCount > 0 ? "Gangguan" : "Aman"}
          badgeVariant={downOnuCount > 0 ? "warning" : "success"}
          detail="Offline atau LOS pada polling terakhir"
          tone="amber"
          icon={WifiOff}
          progress={downRatio}
          href="/onus"
        />
        <MetricCard
          label="Alert Terbuka"
          value={String(openAlertCount)}
          badge={openAlertCount > 0 ? "Perlu Aksi" : "Bersih"}
          badgeVariant={openAlertCount > 0 ? "destructive" : "success"}
          detail={`${operationalAlerts.length} total catatan alert`}
          tone="red"
          icon={Bell}
          href="/alerts"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader className="flex flex-col gap-2 space-y-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-cyan-500/5 text-emerald-600 dark:text-emerald-400">
                <Activity className="h-[18px] w-[18px]" />
              </div>
              <div>
                <CardTitle>Kesehatan Jaringan &amp; Diagnostik Optik</CardTitle>
                <CardDescription className="mt-1">Distribusi ketersediaan ONU, kualitas RX, dan suhu perangkat.</CardDescription>
              </div>
            </div>
            <Button size="sm" variant="ghost" asChild className="self-start sm:self-auto shrink-0">
              <Link to="/onus">
                Detail ONU
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>

          <CardContent>
            <div className="grid items-center gap-6 sm:grid-cols-[164px_1fr]">
              <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
                <svg className="h-36 w-36 -rotate-90" viewBox="0 0 128 128" aria-label={`Ketersediaan ONU ${onuOnlineRatio}%`}>
                  <defs>
                    <linearGradient id="onuHealthRing" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--chart-1)" />
                      <stop offset="100%" stopColor="var(--chart-4)" />
                    </linearGradient>
                  </defs>
                  <circle cx="64" cy="64" r={ringRadius} fill="none" className="stroke-muted/70" strokeWidth="11" />
                  <circle
                    cx="64"
                    cy="64"
                    r={ringRadius}
                    fill="none"
                    stroke="url(#onuHealthRing)"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-extrabold tracking-tight tabular-nums">{onuOnlineRatio}%</span>
                  <span className="text-[11px] font-medium text-muted-foreground">ONU Online</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-muted-foreground">Komposisi Status ONU</span>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Optimal
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        RX Lemah
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Down/LOS
                      </span>
                    </div>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    {optimalPct > 0 && (
                      <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${optimalPct}%` }} />
                    )}
                    {weakRxPct > 0 && (
                      <div className="bg-amber-500 transition-all duration-500" style={{ width: `${weakRxPct}%` }} />
                    )}
                    {downPct > 0 && (
                      <div className="bg-rose-500 transition-all duration-500" style={{ width: `${downPct}%` }} />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:bg-muted/35 sm:p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Online Optimal
                      </span>
                      <span className="font-bold text-foreground tabular-nums">{optimalOnuCount}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Sinyal RX dalam batas aman</p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:bg-muted/35 sm:p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        Offline / LOS
                      </span>
                      <span className="font-bold text-foreground tabular-nums">{downOnuCount}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Terdeteksi tidak terhubung</p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:bg-muted/35 sm:p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        RX Lemah
                      </span>
                      <Badge variant={weakRxCount > 0 ? "warning" : "success"} className="h-5 px-1.5 text-[11px] tabular-nums">
                        {weakRxCount}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Ambang &le; -27 dBm</p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5 transition-colors hover:bg-muted/35 sm:p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                        <Thermometer className="h-3.5 w-3.5 text-rose-500" />
                        Suhu Tinggi
                      </span>
                      <Badge variant={highTempCount > 0 ? "destructive" : "success"} className="h-5 px-1.5 text-[11px] tabular-nums">
                        {highTempCount}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Ambang &ge; 55 &deg;C</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="relative flex flex-col justify-between overflow-hidden xl:col-span-5">
          <div className="bg-dot-grid pointer-events-none absolute right-0 top-0 h-32 w-48 opacity-45 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/15 to-sky-500/5 text-cyan-600 dark:text-cyan-400">
                <MapPin className="h-[18px] w-[18px]" />
              </div>
              <div>
                <CardTitle>Cakupan Pemetaan ONU</CardTitle>
                <CardDescription className="mt-1">Status penandaan koordinat pelanggan.</CardDescription>
              </div>
            </div>
            <Badge variant="info" className="px-2.5 py-0.5 text-xs font-bold tabular-nums">
              {mapCoverageRatio}%
            </Badge>
          </CardHeader>

          <CardContent className="relative flex flex-1 flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight tabular-nums">{mappedOnuCount}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  / {onus.length} perangkat terpetakan
                </span>
              </div>
              <Progress value={mapCoverageRatio} className="h-2.5" indicatorClassName="bg-cyan-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Terpetakan</p>
                <p className="mt-1 text-xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">{mappedOnuCount}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Belum Diset</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{unmappedCount}</p>
              </div>
            </div>

            <Button className="w-full" variant="outline" asChild>
              <Link to="/map">
                <MapPin className="h-4 w-4 text-primary" />
                Buka Peta Interaktif
                <ArrowRight className="ml-auto h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <Card>
          <CardHeader className="flex flex-col gap-2 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <Network className="h-4 w-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Status Perangkat OLT</CardTitle>
                  <Badge variant="outline" className="tabular-nums text-[11px]">
                    {onlineOltCount}/{olts.length} Online
                  </Badge>
                </div>
                <CardDescription className="mt-1">Daftar OLT terdaftar dan hasil polling terbaru.</CardDescription>
              </div>
            </div>
            <Button size="sm" variant="ghost" asChild className="self-start sm:self-auto">
              <Link to="/olts">
                Kelola OLT
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>

          <CardContent>
            {olts.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center sm:p-10">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-4 ring-primary/5">
                  <Network className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold">Belum ada OLT terdaftar</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  Tambahkan perangkat OLT untuk mulai melakukan polling SNMP dan pemetaan ONU.
                </p>
                <Button size="sm" className="mt-4" asChild>
                  <Link to="/olts">Tambah OLT Pertama</Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2.5 md:hidden">
                  {olts.map((olt) => (
                    <div key={olt.id} className="rounded-xl border bg-muted/15 p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{olt.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {olt.model && olt.model !== "-" ? olt.model : olt.lastSeen}
                          </p>
                        </div>
                        <StatusBadge value={olt.status} className="shrink-0" />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <Badge variant="outline">{olt.vendor}</Badge>
                        <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-foreground/90">
                          {olt.ipAddress}:{olt.snmpPort}
                        </span>
                        <Badge variant="secondary" className="tabular-nums">
                          {olt.activeOnu} ONU Aktif
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={pollingOltId === olt.id}
                        onClick={() => void pollOnu(olt)}
                      >
                        <RefreshCcw className={cn("h-3.5 w-3.5", pollingOltId === olt.id && "animate-spin text-primary")} />
                        {pollingOltId === olt.id ? "Polling..." : "Poll ONU"}
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama OLT</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>IP : Port</TableHead>
                      <TableHead className="text-right">ONU Aktif</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Poll</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {olts.map((olt) => (
                      <TableRow key={olt.id}>
                        <TableCell>
                          <div className="font-semibold">{olt.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {olt.model && olt.model !== "-" ? olt.model : olt.lastSeen}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{olt.vendor}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="inline-block rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground/90">
                            {olt.ipAddress}:{olt.snmpPort}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex min-w-[2.25rem] justify-center rounded-md bg-muted/60 px-2 py-0.5 text-xs font-semibold tabular-nums">
                            {olt.activeOnu}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={olt.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 rounded-full"
                                disabled={pollingOltId === olt.id}
                                onClick={() => void pollOnu(olt)}
                                aria-label={`Poll ${olt.name}`}
                              >
                                <RefreshCcw className={cn("h-3.5 w-3.5", pollingOltId === olt.id && "animate-spin text-primary")} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Poll ONU {olt.name}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle>Alert Terbaru</CardTitle>
                    {openAlertCount > 0 && (
                      <Badge variant="destructive" className="tabular-nums">
                        {openAlertCount}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="mt-1">Gangguan dan perubahan status terkini.</CardDescription>
                </div>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/alerts">
                  Lihat Semua
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>

            <Tabs value={alertTab} onValueChange={(v) => setAlertTab(v as "all" | "open")}>
              <TabsList className="grid h-8 w-full grid-cols-2">
                <TabsTrigger value="all" className="h-6 text-xs">
                  Semua ({operationalAlerts.length})
                </TabsTrigger>
                <TabsTrigger value="open" className="h-6 text-xs">
                  Terbuka ({openAlertCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent className="flex-1">
            {visibleAlerts.length === 0 ? (
              <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center sm:h-[330px]">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/75" />
                <p className="mt-2 text-sm font-medium">
                  {alertTab === "open" ? "Tidak ada alert terbuka" : "Semua perangkat normal"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Tidak ada alert gangguan yang perlu ditindaklanjuti.</p>
              </div>
            ) : (
              <ScrollArea className="h-[290px] pr-3 sm:h-[330px]">
                <div className="space-y-2.5">
                  {visibleAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-xl border border-l-4 p-3 text-xs transition-colors",
                        alert.severity === "critical"
                          ? "border-l-red-500 bg-red-500/[0.04] hover:bg-red-500/[0.07]"
                          : alert.severity === "warning"
                            ? "border-l-amber-500 bg-amber-500/[0.04] hover:bg-amber-500/[0.07]"
                            : "border-l-sky-500 bg-sky-500/[0.04] hover:bg-sky-500/[0.07]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold leading-snug">{alert.title}</span>
                        <StatusBadge value={alert.severity} className="shrink-0" />
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{alert.detail}</p>
                      <p className="mt-1.5 text-[10px] text-muted-foreground/80">{alert.createdAt}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
