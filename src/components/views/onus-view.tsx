import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  LocateFixed,
  MapPin,
  Pencil,
  RefreshCcw,
  Search,
  X,
} from "lucide-react"

import { BulkLocationImportDialog } from "@/components/bulk-location-import-dialog"
import { StatusBadge } from "@/components/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMonitoring } from "@/context/monitoring-context"
import { formatRx, formatTemp, getRxQuality } from "@/lib/monitoring-utils"
import { cn } from "@/lib/utils"
import type { Onu } from "@shared/types"

type OnuFilterTab = "all" | "online" | "down" | "weak-rx" | "unmapped"

export function OnusView() {
  const { state, pollingOltId, setLocationDialogOnu, setViewLocationDialogOnu, pollOnu, saveRename } = useMonitoring()
  const { olts, onus } = state

  const [selectedOltId, setSelectedOltId] = useState("all")
  const [statusTab, setStatusTab] = useState<OnuFilterTab>("all")
  const [query, setQuery] = useState("")
  const [pageSize, setPageSize] = useState("25")
  const [page, setPage] = useState(1)

  const [editingOnuId, setEditingOnuId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [detailOnu, setDetailOnu] = useState<Onu | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const oltNameMap = useMemo(() => new Map(olts.map((o) => [o.id, o.name])), [olts])

  const oltScopedOnus = useMemo(
    () => (selectedOltId === "all" ? onus : onus.filter((o) => o.oltId === selectedOltId)),
    [onus, selectedOltId],
  )

  const tabCounts = useMemo(() => {
    let online = 0
    let down = 0
    let weakRx = 0
    let unmapped = 0
    for (const o of oltScopedOnus) {
      if (o.status === "online") {
        online += 1
        if (o.rxPower !== 0 && o.rxPower <= -27) weakRx += 1
      } else {
        down += 1
      }
      if (o.latitude == null || o.longitude == null) unmapped += 1
    }
    return { all: oltScopedOnus.length, online, down, "weak-rx": weakRx, unmapped }
  }, [oltScopedOnus])

  const filteredOnus = useMemo(() => {
    const q = query.trim().toLowerCase()
    return oltScopedOnus.filter((onu) => {
      if (statusTab === "online" && onu.status !== "online") return false
      if (statusTab === "down" && onu.status === "online") return false
      if (statusTab === "weak-rx" && !(onu.status === "online" && onu.rxPower !== 0 && onu.rxPower <= -27)) return false
      if (statusTab === "unmapped" && onu.latitude != null && onu.longitude != null) return false
      if (q) {
        const hay = `${onu.name} ${onu.serialNumber} ${onu.ponPort}:${onu.onuIndex}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [oltScopedOnus, statusTab, query])

  const pageSizeNum = Number(pageSize) || 25
  const totalPages = Math.max(1, Math.ceil(filteredOnus.length / pageSizeNum))
  const safePage = Math.min(page, totalPages)
  const paginatedOnus = useMemo(() => {
    const start = (safePage - 1) * pageSizeNum
    return filteredOnus.slice(start, start + pageSizeNum)
  }, [filteredOnus, safePage, pageSizeNum])

  useEffect(() => {
    setPage(1)
  }, [selectedOltId, statusTab, query, pageSize])

  const selectedOlt = olts.find((o) => o.id === selectedOltId) ?? null

  async function commitRename(onu: Onu) {
    if (!draftName.trim() || renaming) return
    setRenaming(true)
    try {
      const ok = await saveRename(onu, draftName)
      if (ok) setEditingOnuId(null)
    } finally {
      setRenaming(false)
    }
  }

  const startIndex = filteredOnus.length === 0 ? 0 : (safePage - 1) * pageSizeNum + 1
  const endIndex = Math.min(filteredOnus.length, safePage * pageSizeNum)
  const detailRx = detailOnu ? getRxQuality(detailOnu.rxPower) : null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Daftar Perangkat ONU/ONT</CardTitle>
              <CardDescription className="mt-1">
                Pantau sinyal optik, suhu, status sinkronisasi, rename nama ONU, dan tandai lokasi di peta.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Select value={selectedOltId} onValueChange={setSelectedOltId}>
                <SelectTrigger className="w-full sm:w-[190px]">
                  <SelectValue placeholder="Semua OLT" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua OLT ({olts.length})</SelectItem>
                  {olts.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                {selectedOlt ? (
                  <Button className="w-full sm:w-auto" disabled={pollingOltId === selectedOlt.id} onClick={() => void pollOnu(selectedOlt)}>
                    <RefreshCcw className={cn("h-4 w-4", pollingOltId === selectedOlt.id && "animate-spin")} />
                    Poll ONU
                  </Button>
                ) : olts.length <= 1 ? (
                  <Button className="w-full sm:w-auto" disabled={!olts[0] || pollingOltId === olts[0]?.id} onClick={() => olts[0] && void pollOnu(olts[0])}>
                    <RefreshCcw className={cn("h-4 w-4", olts[0] && pollingOltId === olts[0].id && "animate-spin")} />
                    Poll ONU
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="w-full sm:w-auto" disabled={Boolean(pollingOltId)}>
                        <RefreshCcw className={cn("h-4 w-4", pollingOltId && "animate-spin")} />
                        Poll ONU
                        <ChevronDown className="h-3.5 w-3.5 opacity-75" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {olts.map((o) => (
                        <DropdownMenuItem key={o.id} onClick={() => void pollOnu(o)}>
                          <RefreshCcw className="h-3.5 w-3.5" />
                          <span>Poll {o.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setImportOpen(true)}>
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Import Excel
                </Button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9 pr-8"
                  placeholder="Cari nama / serial / PON"
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
            </div>
          </div>

          <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as OnuFilterTab)} className="mt-3">
            <div className="no-scrollbar w-full overflow-x-auto pb-0.5">
              <TabsList className="w-max flex-nowrap justify-start gap-1">
              <TabsTrigger value="all">
                Semua
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {tabCounts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="online">
                Online
                <Badge variant="success" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {tabCounts.online}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="down">
                Offline / LOS
                <Badge variant={tabCounts.down > 0 ? "destructive" : "secondary"} className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {tabCounts.down}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="weak-rx">
                RX Lemah
                <Badge variant={tabCounts["weak-rx"] > 0 ? "warning" : "secondary"} className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {tabCounts["weak-rx"]}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="unmapped">
                Belum di Peta
                <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[10px] tabular-nums">
                  {tabCounts.unmapped}
                </Badge>
              </TabsTrigger>
            </TabsList>
            </div>
          </Tabs>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2.5 md:hidden">
            {paginatedOnus.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                {onus.length === 0
                  ? "Belum ada data ONU. Jalankan Poll ONU terlebih dahulu."
                  : "Tidak ada ONU yang sesuai dengan filter saat ini."}
              </div>
            ) : (
              paginatedOnus.map((onu) => {
                const hasCoord = onu.latitude != null && onu.longitude != null
                const rxMeta = getRxQuality(onu.rxPower)
                const isHot = onu.temperatureC != null && onu.temperatureC >= 55

                return (
                  <div key={onu.id} className="rounded-xl border bg-muted/15 p-3.5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {editingOnuId === onu.id ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={draftName}
                              autoFocus
                              onChange={(e) => setDraftName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void commitRename(onu)
                                if (e.key === "Escape") setEditingOnuId(null)
                              }}
                            />
                            <Button
                              size="icon"
                              className="shrink-0"
                              disabled={renaming || !draftName.trim()}
                              onClick={() => void commitRename(onu)}
                              aria-label="Simpan nama"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => setEditingOnuId(null)}
                              aria-label="Batal rename"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <p className="truncate text-sm font-semibold">{onu.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              {selectedOltId === "all" && <span>{oltNameMap.get(onu.oltId) ?? "-"}</span>}
                              <Badge variant="outline" className="font-mono text-[10px]">
                                PON {onu.ponPort}:{onu.onuIndex}
                              </Badge>
                              <span className="font-mono">{onu.serialNumber}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <StatusBadge value={onu.status} className="shrink-0" />
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl border bg-background/70 p-2.5 text-xs">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Sinyal RX</p>
                        <p
                          className={cn(
                            "mt-0.5 font-mono text-[11px] font-semibold tabular-nums",
                            rxMeta.tone === "bad"
                              ? "text-red-600 dark:text-red-400"
                              : rxMeta.tone === "warn"
                                ? "text-amber-600 dark:text-amber-400"
                                : rxMeta.tone === "good"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground",
                          )}
                        >
                          {formatRx(onu.rxPower)}
                        </p>
                        <Progress
                          value={rxMeta.percent}
                          className="mt-1 h-1"
                          indicatorClassName={
                            rxMeta.tone === "bad"
                              ? "bg-red-500"
                              : rxMeta.tone === "warn"
                                ? "bg-amber-500"
                                : rxMeta.tone === "good"
                                  ? "bg-emerald-500"
                                  : "bg-muted-foreground/30"
                          }
                        />
                      </div>

                      <div>
                        <p className="text-[10px] text-muted-foreground">Suhu</p>
                        <p
                          className={cn(
                            "mt-0.5 font-mono text-[11px] font-semibold tabular-nums",
                            isHot ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                          )}
                        >
                          {formatTemp(onu.temperatureC)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-muted-foreground">Peta</p>
                        <button
                          type="button"
                          onClick={() => (hasCoord ? setViewLocationDialogOnu(onu) : setLocationDialogOnu(onu))}
                          className="mt-0.5 block"
                        >
                          <Badge variant={hasCoord ? "success" : "secondary"} className="h-5 px-1.5 text-[10px]">
                            {hasCoord ? "Terpetakan" : "Belum diset"}
                          </Badge>
                        </button>
                      </div>
                    </div>

                    {hasCoord ? (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setViewLocationDialogOnu(onu)}>
                            <LocateFixed className="h-3.5 w-3.5 text-primary" />
                            View Location
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setLocationDialogOnu(onu)}>
                            <MapPin className="h-3.5 w-3.5 text-primary" />
                            Edit Lokasi
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingOnuId(onu.id)
                              setDraftName(onu.name)
                            }}
                            aria-label={`Rename ${onu.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Rename
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setDetailOnu(onu)} aria-label={`Detail ${onu.name}`}>
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setLocationDialogOnu(onu)}>
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          Set Lokasi
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => {
                            setEditingOnuId(onu.id)
                            setDraftName(onu.name)
                          }}
                          aria-label={`Rename ${onu.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="secondary" onClick={() => setDetailOnu(onu)} aria-label={`Detail ${onu.name}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table className="min-w-[960px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Serial / PON</TableHead>
                  <TableHead>Sinyal RX</TableHead>
                  <TableHead>Suhu</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lokasi Peta</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOnus.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {onus.length === 0
                        ? "Belum ada data ONU. Jalankan Poll ONU terlebih dahulu."
                        : "Tidak ada ONU yang sesuai dengan filter saat ini."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOnus.map((onu) => {
                    const hasCoord = onu.latitude != null && onu.longitude != null
                    const rxMeta = getRxQuality(onu.rxPower)
                    const isHot = onu.temperatureC != null && onu.temperatureC >= 55

                    return (
                      <TableRow key={onu.id}>
                        <TableCell className="font-medium">
                          {editingOnuId === onu.id ? (
                            <div className="flex items-center gap-1.5">
                              <Input
                                className="h-8 max-w-[210px]"
                                value={draftName}
                                autoFocus
                                onChange={(e) => setDraftName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void commitRename(onu)
                                  if (e.key === "Escape") setEditingOnuId(null)
                                }}
                              />
                              <Button
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={renaming || !draftName.trim()}
                                onClick={() => void commitRename(onu)}
                                aria-label="Simpan nama"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 shrink-0"
                                onClick={() => setEditingOnuId(null)}
                                aria-label="Batal rename"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold">{onu.name}</div>
                              {selectedOltId === "all" && (
                                <div className="text-[11px] text-muted-foreground">{oltNameMap.get(onu.oltId) ?? "-"}</div>
                              )}
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="font-mono text-xs">{onu.serialNumber}</div>
                          <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                            PON {onu.ponPort}:{onu.onuIndex}
                          </Badge>
                        </TableCell>

                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-28 space-y-1">
                                <div
                                  className={cn(
                                    "font-mono text-xs font-semibold tabular-nums",
                                    rxMeta.tone === "bad"
                                      ? "text-red-600 dark:text-red-400"
                                      : rxMeta.tone === "warn"
                                        ? "text-amber-600 dark:text-amber-400"
                                        : rxMeta.tone === "good"
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : "text-muted-foreground",
                                  )}
                                >
                                  {formatRx(onu.rxPower)}
                                </div>
                                <Progress
                                  value={rxMeta.percent}
                                  className="h-1.5"
                                  indicatorClassName={
                                    rxMeta.tone === "bad"
                                      ? "bg-red-500"
                                      : rxMeta.tone === "warn"
                                        ? "bg-amber-500"
                                        : rxMeta.tone === "good"
                                          ? "bg-emerald-500"
                                          : "bg-muted-foreground/30"
                                  }
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {rxMeta.label} • TX: {formatRx(onu.txPower)}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>

                        <TableCell>
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              isHot ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                            )}
                          >
                            {formatTemp(onu.temperatureC)}
                          </span>
                        </TableCell>

                        <TableCell>
                          {onu.status !== "online" && onu.downReason ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <StatusBadge value={onu.status} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Alasan: {onu.downReason}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <StatusBadge value={onu.status} />
                          )}
                        </TableCell>

                        <TableCell>
                          <button
                            type="button"
                            onClick={() => (hasCoord ? setViewLocationDialogOnu(onu) : setLocationDialogOnu(onu))}
                            title={hasCoord ? "Lihat lokasi di peta" : "Set lokasi di peta"}
                            className="text-left"
                          >
                            {hasCoord ? (
                              <Badge variant="success" className="font-mono text-[11px] hover:opacity-85">
                                {onu.latitude!.toFixed(5)}, {onu.longitude!.toFixed(5)}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[11px] hover:bg-secondary/80">
                                Belum diset
                              </Badge>
                            )}
                          </button>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {hasCoord && (
                              <Button size="sm" variant="secondary" onClick={() => setViewLocationDialogOnu(onu)}>
                                <LocateFixed className="h-3.5 w-3.5 text-primary" />
                                View Location
                              </Button>
                            )}

                            <Button size="sm" variant="outline" onClick={() => setLocationDialogOnu(onu)}>
                              <MapPin className="h-3.5 w-3.5 text-primary" />
                              {hasCoord ? "Edit Lokasi" : "Set Lokasi"}
                            </Button>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setEditingOnuId(onu.id)
                                    setDraftName(onu.name)
                                  }}
                                  aria-label={`Rename ${onu.name}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Rename ONU</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => setDetailOnu(onu)}
                                  aria-label={`Detail ${onu.name}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Lihat Detail Telemetri</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground tabular-nums">
              Menampilkan <b className="text-foreground">{startIndex}</b>–<b className="text-foreground">{endIndex}</b> dari{" "}
              <b className="text-foreground">{filteredOnus.length}</b> ONU
            </p>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="text-xs text-muted-foreground">Baris:</span>
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger className="h-8 w-[76px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Halaman sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-xs font-medium tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Halaman berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(detailOnu)} onOpenChange={(open) => !open && setDetailOnu(null)}>
        <SheetContent side="right" className="flex flex-col sm:max-w-md">
          {detailOnu && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6">{detailOnu.name}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                  <StatusBadge value={detailOnu.status} />
                  <StatusBadge value={detailOnu.syncStatus} />
                  <Badge variant="outline">{oltNameMap.get(detailOnu.oltId) ?? "-"}</Badge>
                </SheetDescription>
              </SheetHeader>

              <Separator className="my-4" />

              <ScrollArea className="flex-1 pr-3">
                <div className="space-y-4">
                  {detailOnu.status !== "online" && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-xs">Alasan Down</AlertTitle>
                      <AlertDescription>{detailOnu.downReason || "Perangkat terdeteksi offline / LOS."}</AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-muted-foreground">PON Port / Index</p>
                      <p className="mt-1 font-mono font-semibold">
                        PON {detailOnu.ponPort}:{detailOnu.onuIndex}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-muted-foreground">Serial Number</p>
                      <p className="mt-1 font-mono font-semibold">{detailOnu.serialNumber}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-muted-foreground">Suhu Perangkat</p>
                      <p className="mt-1 font-mono font-semibold">{formatTemp(detailOnu.temperatureC)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-muted-foreground">Jarak Optik</p>
                      <p className="mt-1 font-mono font-semibold">
                        {detailOnu.distanceMeters ? `${detailOnu.distanceMeters} m` : "-"}
                      </p>
                    </div>
                  </div>

                  {detailRx && (
                    <div className="rounded-xl border p-3.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-muted-foreground">Kualitas Sinyal Optik</span>
                        <Badge
                          variant={
                            detailRx.tone === "bad"
                              ? "destructive"
                              : detailRx.tone === "warn"
                                ? "warning"
                                : detailRx.tone === "good"
                                  ? "success"
                                  : "secondary"
                          }
                        >
                          {detailRx.label}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between font-mono text-sm font-bold">
                        <span>RX: {formatRx(detailOnu.rxPower)}</span>
                        <span className="text-xs font-normal text-muted-foreground">TX: {formatRx(detailOnu.txPower)}</span>
                      </div>
                      <Progress
                        value={detailRx.percent}
                        className="mt-2.5 h-2"
                        indicatorClassName={
                          detailRx.tone === "bad"
                            ? "bg-red-500"
                            : detailRx.tone === "warn"
                              ? "bg-amber-500"
                              : detailRx.tone === "good"
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/30"
                        }
                      />
                    </div>
                  )}

                  <div className="space-y-2 rounded-xl border p-3.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Koordinat Peta</span>
                      {detailOnu.latitude != null && detailOnu.longitude != null ? (
                        <span className="font-mono font-semibold">
                          {detailOnu.latitude.toFixed(6)}, {detailOnu.longitude.toFixed(6)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Belum ditentukan</span>
                      )}
                    </div>
                    {detailOnu.locationNote && (
                      <p className="text-muted-foreground">Catatan: {detailOnu.locationNote}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">Last Seen: {detailOnu.lastSeen}</p>
                  </div>
                </div>
              </ScrollArea>

              <SheetFooter className="mt-4 border-t pt-4">
                {detailOnu.latitude != null && detailOnu.longitude != null ? (
                  <div className="grid w-full grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const target = detailOnu
                        setDetailOnu(null)
                        setViewLocationDialogOnu(target)
                      }}
                    >
                      <LocateFixed className="h-4 w-4 text-primary" />
                      View Location
                    </Button>
                    <Button
                      onClick={() => {
                        const target = detailOnu
                        setDetailOnu(null)
                        setLocationDialogOnu(target)
                      }}
                    >
                      <MapPin className="h-4 w-4" />
                      Edit Lokasi Peta
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => {
                      const target = detailOnu
                      setDetailOnu(null)
                      setLocationDialogOnu(target)
                    }}
                  >
                    <MapPin className="h-4 w-4" />
                    Set Lokasi Peta
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <BulkLocationImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultOltId={selectedOltId !== "all" ? selectedOltId : undefined}
      />
    </div>
  )
}
