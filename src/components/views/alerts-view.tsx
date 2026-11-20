import { useMemo, useState } from "react"
import { AlertTriangle, Bell, CheckCircle2, CircleAlert, Info, Search, Trash2, X } from "lucide-react"

import { StatusBadge } from "@/components/status-badge"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMonitoring } from "@/context/monitoring-context"
import { parseAlertDetail } from "@/lib/monitoring-utils"
import { cn } from "@/lib/utils"

type AlertTab = "all" | "open" | "critical" | "warning" | "acknowledged"

export function AlertsView() {
  const { operationalAlerts, clearAlerts } = useMonitoring()
  const [tab, setTab] = useState<AlertTab>("all")
  const [query, setQuery] = useState("")

  const counts = useMemo(() => {
    let open = 0
    let critical = 0
    let warning = 0
    let acknowledged = 0
    for (const a of operationalAlerts) {
      if (a.acknowledged) acknowledged += 1
      else open += 1
      if (a.severity === "critical") critical += 1
      else if (a.severity === "warning") warning += 1
    }
    return { all: operationalAlerts.length, open, critical, warning, acknowledged }
  }, [operationalAlerts])

  const filteredAlerts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return operationalAlerts.filter((a) => {
      if (tab === "open" && a.acknowledged) return false
      if (tab === "acknowledged" && !a.acknowledged) return false
      if (tab === "critical" && a.severity !== "critical") return false
      if (tab === "warning" && a.severity !== "warning") return false
      if (q && !`${a.title} ${a.detail}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [operationalAlerts, tab, query])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Alert</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{counts.all}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Masih Terbuka</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{counts.open}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-rose-500/10 text-rose-500">
              <CircleAlert className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Severity Critical</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{counts.critical}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-red-500/10 text-red-500">
              <CircleAlert className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Severity Warning</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{counts.warning}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500/10 text-amber-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Alert Aktif &amp; Riwayat ({filteredAlerts.length})</CardTitle>
              <CardDescription className="mt-1">
                Notifikasi perangkat down, sinyal optik lemah, suhu tinggi, dan recovery otomatis.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 pr-8"
                  placeholder="Cari alert..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Hapus pencarian"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button size="sm" variant="outline" onClick={() => void clearAlerts("acknowledged")}>
                Bersihkan Selesai
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                    Bersihkan Semua
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Bersihkan seluruh riwayat alert?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Seluruh riwayat alert yang tersimpan di database SQLite akan dikosongkan. Alert aktif dari perangkat yang masih down akan tetap muncul sampai perangkat kembali online.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => void clearAlerts("all")}
                    >
                      Ya, Bersihkan Semua
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as AlertTab)} className="mt-3">
            <TabsList className="h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="all">
                Semua
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {counts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="open">
                Terbuka
                <Badge variant={counts.open > 0 ? "destructive" : "secondary"} className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {counts.open}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="critical">
                Critical
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {counts.critical}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="warning">
                Warning
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {counts.warning}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="acknowledged">
                Selesai
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {counts.acknowledged}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent>
          {filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500/75" />
              <p className="mt-3 text-sm font-semibold">Tidak ada alert ditemukan</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {operationalAlerts.length === 0
                  ? "Semua OLT dan ONU/ONT berada dalam kondisi normal."
                  : "Coba ubah tab status atau kata kunci pencarian."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => {
                const detailChips = parseAlertDetail(alert.detail)
                const SeverityIcon =
                  alert.severity === "critical" ? CircleAlert : alert.severity === "warning" ? AlertTriangle : Info

                return (
                  <div
                    key={alert.id}
                    className={cn(
                      "flex flex-col justify-between gap-3 rounded-xl border border-l-4 bg-card p-4 transition-colors hover:bg-muted/25 sm:flex-row sm:items-start",
                      alert.severity === "critical"
                        ? "border-l-red-500"
                        : alert.severity === "warning"
                          ? "border-l-amber-500"
                          : "border-l-sky-500",
                    )}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityIcon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            alert.severity === "critical"
                              ? "text-red-500"
                              : alert.severity === "warning"
                                ? "text-amber-500"
                                : "text-sky-500",
                          )}
                        />
                        <StatusBadge value={alert.severity} />
                        <span className="text-sm font-semibold">{alert.title}</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {detailChips.map((chip, idx) => (
                          <Badge key={idx} variant="secondary" className="font-normal text-[11px]">
                            {chip.key ? (
                              <>
                                <span className="text-muted-foreground">{chip.key}:</span>
                                <span className="font-medium text-foreground">{chip.value}</span>
                              </>
                            ) : (
                              chip.value
                            )}
                          </Badge>
                        ))}
                      </div>

                      <p className="text-[11px] text-muted-foreground">{alert.createdAt}</p>
                    </div>

                    <Badge variant={alert.acknowledged ? "success" : "outline"} className="shrink-0 self-start">
                      {alert.acknowledged ? "Selesai" : "Terbuka"}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
