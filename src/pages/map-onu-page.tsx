import { useMemo, useState } from "react"
import { MapContainer, Marker, Popup, useMapEvents } from "react-leaflet"
import { CheckCircle2, FileSpreadsheet, Globe, Layers, MapPin, Pencil, Save, Search, Wifi, WifiOff, X } from "lucide-react"

import { BulkLocationImportDialog } from "@/components/bulk-location-import-dialog"
import { MapTileLayers, type MapLayerMode } from "@/components/map-tile-layers"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMonitoring } from "@/context/monitoring-context"
import { draftOnuIcon, offlineOnuIcon, onlineOnuIcon } from "@/lib/map-markers"
import { cn } from "@/lib/utils"
import type { Onu } from "@shared/types"

function QuickPickListener({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (active) onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function MapOnuPage() {
  const { state, saveOnuLocation, setLocationDialogOnu } = useMonitoring()
  const { olts, onus } = state
  const mapSettings = state.settings.map

  const [oltFilter, setOltFilter] = useState("all")
  const [ponFilter, setPonFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all")
  const [query, setQuery] = useState("")
  const [layer, setLayer] = useState<MapLayerMode>("satellite")

  const [assigningOnu, setAssigningOnu] = useState<Onu | null>(null)
  const [draftCoord, setDraftCoord] = useState<{ lat: number; lng: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const oltNameMap = useMemo(() => new Map(olts.map((o) => [o.id, o.name])), [olts])

  const ponOptions = useMemo(() => {
    const set = new Set(onus.filter((o) => oltFilter === "all" || o.oltId === oltFilter).map((o) => o.ponPort))
    return [...set].sort((a, b) => Number(a) - Number(b))
  }, [onus, oltFilter])

  const filteredOnus = useMemo(() => {
    return onus.filter((onu) => {
      if (oltFilter !== "all" && onu.oltId !== oltFilter) return false
      if (ponFilter !== "all" && onu.ponPort !== ponFilter) return false
      if (statusFilter === "online" && onu.status !== "online") return false
      if (statusFilter === "offline" && onu.status === "online") return false
      if (query.trim()) {
        const hay = `${onu.name} ${onu.serialNumber} ${onu.ponPort}:${onu.onuIndex}`.toLowerCase()
        if (!hay.includes(query.trim().toLowerCase())) return false
      }
      return true
    })
  }, [onus, oltFilter, ponFilter, statusFilter, query])

  const mappedOnus = filteredOnus.filter((o) => o.latitude != null && o.longitude != null)
  const unmappedOnus = filteredOnus.filter((o) => o.latitude == null || o.longitude == null)
  const mappedOnlineCount = mappedOnus.filter((o) => o.status === "online").length
  const mappedOfflineCount = mappedOnus.length - mappedOnlineCount
  const coveragePct = filteredOnus.length ? Math.round((mappedOnus.length / filteredOnus.length) * 100) : 0

  async function handleQuickSave() {
    if (!assigningOnu || !draftCoord) return
    setSaving(true)
    try {
      await saveOnuLocation(assigningOnu.id, draftCoord.lat, draftCoord.lng, assigningOnu.locationNote ?? "")
      setAssigningOnu(null)
      setDraftCoord(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 pr-8"
                placeholder="Cari nama ONU / Serial / PON..."
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

            <Select
              value={oltFilter}
              onValueChange={(v) => {
                setOltFilter(v)
                setPonFilter("all")
              }}
            >
              <SelectTrigger className="w-[165px]">
                <SelectValue placeholder="Semua OLT" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua OLT</SelectItem>
                {olts.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ponFilter} onValueChange={setPonFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Semua PON" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua PON</SelectItem>
                {ponOptions.map((pon) => (
                  <SelectItem key={pon} value={pon}>
                    PON {pon}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "online" | "offline")}>
              <SelectTrigger className="w-[165px]">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="online">Online (Hijau)</SelectItem>
                <SelectItem value="offline">Offline (Merah)</SelectItem>
              </SelectContent>
            </Select>

            <Tabs value={layer} onValueChange={(v) => setLayer(v as MapLayerMode)}>
              <TabsList className="h-9">
                <TabsTrigger value="satellite" className="text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Satelit
                </TabsTrigger>
                <TabsTrigger value="esri" className="text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Esri
                </TabsTrigger>
                <TabsTrigger value="osm" className="text-xs">
                  <Globe className="h-3.5 w-3.5" />
                  OSM
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              Import XLS
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" className="gap-1.5 tabular-nums">
                <Wifi className="h-3 w-3" />
                Online: {mappedOnlineCount}
              </Badge>
              <Badge variant="destructive" className="gap-1.5 tabular-nums">
                <WifiOff className="h-3 w-3" />
                Offline: {mappedOfflineCount}
              </Badge>
              <Badge variant="secondary" className="tabular-nums">
                Belum diset: {unmappedOnus.length}
              </Badge>
            </div>

            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span>Cakupan peta:</span>
              <Progress value={coveragePct} className="h-1.5 w-28" indicatorClassName="bg-cyan-500" />
              <span className="font-semibold text-foreground tabular-nums">{coveragePct}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {assigningOnu && (
        <Alert variant="info" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <div>
              <AlertTitle className="text-sm">Mode Set Lokasi: {assigningOnu.name}</AlertTitle>
              <AlertDescription className="mt-0.5">
                {draftCoord
                  ? `Titik dipilih: ${draftCoord.lat.toFixed(6)}, ${draftCoord.lng.toFixed(6)} — klik Simpan Titik untuk menyimpan ke SQLite.`
                  : "Klik pada titik lokasi perangkat ONU di peta."}
              </AlertDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-0">
            <Button size="sm" disabled={!draftCoord || saving} onClick={() => void handleQuickSave()}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Menyimpan..." : "Simpan Titik"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAssigningOnu(null)
                setDraftCoord(null)
              }}
            >
              <X className="h-3.5 w-3.5" />
              Batal
            </Button>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
        <Card className="isolate relative h-[620px] overflow-hidden">
          <MapContainer center={[mapSettings.defaultLat, mapSettings.defaultLng]} zoom={mapSettings.defaultZoom} maxZoom={20} className="h-full w-full">
            <MapTileLayers layer={layer} />

            <QuickPickListener active={Boolean(assigningOnu)} onPick={(lat, lng) => setDraftCoord({ lat, lng })} />
            {draftCoord && <Marker position={[draftCoord.lat, draftCoord.lng]} icon={draftOnuIcon} />}

            {mappedOnus.map((onu) => {
              const isOnline = onu.status === "online"
              return (
                <Marker key={onu.id} position={[onu.latitude!, onu.longitude!]} icon={isOnline ? onlineOnuIcon : offlineOnuIcon}>
                  <Popup minWidth={240}>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm">{onu.name}</strong>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
                            isOnline ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-red-500/15 text-red-600 dark:text-red-300",
                          )}
                        >
                          {isOnline ? "ONLINE" : "OFFLINE"}
                        </span>
                      </div>
                      <div className="space-y-1 opacity-90">
                        <p>
                          OLT: <b>{oltNameMap.get(onu.oltId) ?? "-"}</b> (PON {onu.ponPort}:{onu.onuIndex})
                        </p>
                        <p className="font-mono text-[11px]">SN: {onu.serialNumber}</p>
                        <p className="font-mono text-[11px]">
                          RX: <b>{onu.rxPower ? `${onu.rxPower} dBm` : "-"}</b> | Suhu:{" "}
                          {onu.temperatureC != null ? `${onu.temperatureC}°C` : "-"}
                        </p>
                        {!isOnline && <p className="text-red-500">Alasan Down: {onu.downReason || "Down"}</p>}
                        {onu.locationNote && <p className="italic opacity-75">Catatan: {onu.locationNote}</p>}
                        <p className="text-[11px] opacity-60">Update: {onu.lastSeen}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={() => setLocationDialogOnu(onu)}>
                        <Pencil className="h-3 w-3" />
                        Edit Lokasi
                      </Button>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </Card>

        <Card className="flex h-[620px] flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">ONU Belum Punya Lokasi</CardTitle>
              <Badge variant="secondary" className="tabular-nums">
                {unmappedOnus.length}
              </Badge>
            </div>
            <CardDescription>Klik perangkat di bawah lalu klik titik lokasi di peta.</CardDescription>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden pb-4">
            <ScrollArea className="h-full pr-3">
              {unmappedOnus.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500/75" />
                  <p className="mt-2 text-xs font-medium">Semua ONU terpetakan</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Semua perangkat pada filter ini sudah memiliki titik koordinat.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unmappedOnus.map((onu) => {
                    const selected = assigningOnu?.id === onu.id
                    return (
                      <button
                        key={onu.id}
                        type="button"
                        onClick={() => {
                          setAssigningOnu(onu)
                          setDraftCoord(null)
                        }}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition-all",
                          selected
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "bg-card hover:border-primary/40 hover:bg-accent/50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold">{onu.name}</span>
                          {onu.status === "online" ? (
                            <Wifi className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          ) : (
                            <WifiOff className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {oltNameMap.get(onu.oltId) ?? "-"} • PON {onu.ponPort}:{onu.onuIndex}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-primary">
                          <MapPin className="h-3 w-3" />
                          {selected ? "Klik titik di peta..." : "Klik untuk tandai di peta"}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <BulkLocationImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultOltId={oltFilter !== "all" ? oltFilter : undefined}
      />
    </div>
  )
}
