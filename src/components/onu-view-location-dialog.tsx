import { useEffect, useState } from "react"
import { MapContainer, Marker, Popup, useMap } from "react-leaflet"
import { Copy, ExternalLink, Globe, Layers, LocateFixed, Pencil } from "lucide-react"
import { toast } from "sonner"

import { MapOverlayControls, MapResizeSync, useMapFullscreen } from "@/components/map-fullscreen"
import { MapTileLayers, type MapLayerMode } from "@/components/map-tile-layers"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { offlineOnuIcon, onlineOnuIcon, targetOfflineOnuIcon, targetOnlineOnuIcon } from "@/lib/map-markers"
import { formatRx, formatTemp } from "@/lib/monitoring-utils"
import { cn } from "@/lib/utils"
import type { Onu } from "@shared/types"

function FocusTargetMap({ lat, lng, zoom, focusSeq }: { lat: number; lng: number; zoom: number; focusSeq: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], zoom, { animate: focusSeq > 0 })
  }, [lat, lng, zoom, focusSeq, map])
  return null
}

/**
 * Read-only ONU location viewer dialog centered at the closest map zoom with
 * an animated amber pin marker to distinguish the target ONU from neighbors.
 */
export function OnuViewLocationDialog({
  onu,
  oltName,
  otherOnus,
  oltNameMap,
  open,
  onOpenChange,
  onEditLocation,
}: {
  onu: Onu | null
  oltName: string
  otherOnus: Onu[]
  oltNameMap: Map<string, string>
  open: boolean
  onOpenChange: (open: boolean) => void
  onEditLocation: (onu: Onu) => void
}) {
  const [layer, setLayer] = useState<MapLayerMode>("satellite")
  const [focusSeq, setFocusSeq] = useState(0)
  const { containerRef, isCssFullscreen, isFullscreen, exitFullscreen, toggleFullscreen } = useMapFullscreen<HTMLDivElement>({
    handleWindowEscape: false,
  })

  useEffect(() => {
    if (!open) void exitFullscreen()
  }, [open, exitFullscreen])

  useEffect(() => {
    if (open) setFocusSeq(0)
  }, [open, onu?.id])

  const hasCoord = onu != null && onu.latitude != null && onu.longitude != null
  const lat = onu?.latitude ?? 0
  const lng = onu?.longitude ?? 0
  const isOnline = onu?.status === "online"

  function copyCoords() {
    if (!hasCoord || !navigator.clipboard) return
    void navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    toast.success("Koordinat disalin ke clipboard.")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-3xl",
          isCssFullscreen &&
            "!fixed !inset-0 !left-0 !top-0 !h-[100dvh] !max-h-[100dvh] !w-[100vw] !max-w-none !translate-x-0 !translate-y-0 !rounded-none !p-0 !gap-0 overflow-hidden",
        )}
        onEscapeKeyDown={(e) => {
          if (isFullscreen) {
            e.preventDefault()
            void exitFullscreen()
          }
        }}
      >
        {!isCssFullscreen && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <LocateFixed className="h-4 w-4" />
              </span>
              <span className="truncate">Lokasi ONU: {onu?.name}</span>
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge variant="outline">{oltName}</Badge>
              <Badge variant="secondary" className="font-mono">
                PON {onu?.ponPort}:{onu?.onuIndex}
              </Badge>
              <Badge variant="secondary" className="font-mono">
                SN: {onu?.serialNumber}
              </Badge>
              {onu && <StatusBadge value={onu.status} />}
            </DialogDescription>
          </DialogHeader>
        )}

        {!isCssFullscreen && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {hasCoord && (
                <>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {lat.toFixed(6)}, {lng.toFixed(6)}
                  </Badge>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={copyCoords}>
                    <Copy className="h-3.5 w-3.5" />
                    Salin
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                    <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Google Maps
                    </a>
                  </Button>
                </>
              )}
            </div>

            <Tabs value={layer} onValueChange={(v) => setLayer(v as MapLayerMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="satellite" className="h-6 px-2.5 text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Satelit
                </TabsTrigger>
                <TabsTrigger value="esri" className="h-6 px-2.5 text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Esri
                </TabsTrigger>
                <TabsTrigger value="osm" className="h-6 px-2.5 text-xs">
                  <Globe className="h-3.5 w-3.5" />
                  OSM
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        <div
          ref={containerRef}
          className={cn(
            "isolate relative overflow-hidden",
            isCssFullscreen ? "z-30 h-full w-full rounded-none border-0" : "h-[260px] w-full rounded-xl border sm:h-[380px]",
          )}
        >
          <MapOverlayControls
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            layer={layer}
            onLayerChange={setLayer}
            extraActions={
              hasCoord ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFocusSeq((s) => s + 1)}
                  aria-label="Fokus ke titik ONU"
                  title="Fokus Titik ONU (Zoom Terdekat)"
                  className="h-8 border-border/80 bg-background/90 px-2.5 text-foreground shadow-md backdrop-blur-md hover:bg-background"
                >
                  <LocateFixed className="h-3.5 w-3.5 text-amber-500" />
                  <span className="hidden text-xs sm:inline">Fokus Titik</span>
                </Button>
              ) : null
            }
          />

          <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 flex flex-wrap items-center gap-2.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1 text-[11px] shadow-md backdrop-blur-md">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-background" />
              Pin Target
            </span>
            {otherOnus.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 ring-1 ring-white dark:ring-background" />
                ONU Sekitar ({otherOnus.length})
              </span>
            )}
          </div>

          {open && hasCoord && onu ? (
            <MapContainer center={[lat, lng]} zoom={20} maxZoom={21} className="h-full w-full">
              <MapTileLayers layer={layer} />
              <MapResizeSync trigger={`${open}-${isFullscreen}-${onu.id}`} />
              <FocusTargetMap lat={lat} lng={lng} zoom={20} focusSeq={focusSeq} />

              {otherOnus.map((peer) => {
                const peerOnline = peer.status === "online"
                return (
                  <Marker
                    key={peer.id}
                    position={[peer.latitude!, peer.longitude!]}
                    icon={peerOnline ? onlineOnuIcon : offlineOnuIcon}
                    opacity={0.78}
                    zIndexOffset={0}
                  >
                    <Popup minWidth={200}>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-xs">{peer.name}</strong>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                              peerOnline ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-red-500/15 text-red-600 dark:text-red-300",
                            )}
                          >
                            {peerOnline ? "ONLINE" : "OFFLINE"}
                          </span>
                        </div>
                        <p className="opacity-80">
                          {oltNameMap.get(peer.oltId) ?? "-"} • PON {peer.ponPort}:{peer.onuIndex}
                        </p>
                        <p className="font-mono text-[11px] opacity-80">RX: {formatRx(peer.rxPower)}</p>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}

              <Marker
                position={[lat, lng]}
                icon={isOnline ? targetOnlineOnuIcon : targetOfflineOnuIcon}
                zIndexOffset={1000}
              >
                <Popup minWidth={240}>
                  <div className="space-y-1.5 text-xs">
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
                        OLT: <b>{oltName}</b> (PON {onu.ponPort}:{onu.onuIndex})
                      </p>
                      <p className="font-mono text-[11px]">SN: {onu.serialNumber}</p>
                      <p className="font-mono text-[11px]">
                        RX: <b>{formatRx(onu.rxPower)}</b> | Suhu: {formatTemp(onu.temperatureC)}
                      </p>
                      {!isOnline && <p className="text-red-500">Alasan Down: {onu.downReason || "Down"}</p>}
                      {onu.locationNote && <p className="italic opacity-75">Catatan: {onu.locationNote}</p>}
                      <p className="font-mono text-[11px] opacity-75">
                        {lat.toFixed(6)}, {lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          ) : (
            <div className="grid h-full place-items-center bg-muted/20 p-4 text-center text-xs text-muted-foreground">
              Koordinat lokasi ONU belum ditentukan.
            </div>
          )}
        </div>

        {!isCssFullscreen && onu && (
          <div className="grid grid-cols-2 gap-2.5 rounded-xl border bg-muted/20 p-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-[11px] text-muted-foreground">Status</p>
              <div className="mt-1">
                <StatusBadge value={onu.status} />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Sinyal RX</p>
              <p className="mt-1 font-mono font-semibold tabular-nums">{formatRx(onu.rxPower)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Suhu</p>
              <p className="mt-1 font-mono font-semibold tabular-nums">{formatTemp(onu.temperatureC)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Last Seen</p>
              <p className="mt-1 truncate font-medium">{onu.lastSeen}</p>
            </div>
            {(onu.locationNote || (!isOnline && onu.downReason)) && (
              <div className="col-span-2 space-y-1 border-t pt-2 sm:col-span-4">
                {onu.locationNote && <p className="text-muted-foreground">Catatan Lokasi: {onu.locationNote}</p>}
                {!isOnline && onu.downReason && <p className="text-destructive">Alasan Down: {onu.downReason}</p>}
              </div>
            )}
          </div>
        )}

        {!isCssFullscreen && (
          <>
            <Separator />
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {onu ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    await exitFullscreen()
                    onOpenChange(false)
                    onEditLocation(onu)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit Lokasi
                </Button>
              ) : (
                <div className="hidden sm:block" />
              )}

              <Button type="button" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
