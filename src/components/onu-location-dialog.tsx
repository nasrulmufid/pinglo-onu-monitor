import { useEffect, useState } from "react"
import type L from "leaflet"
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet"
import { Globe, Layers, MapPin, Save, Trash2 } from "lucide-react"

import { MapTileLayers, type MapLayerMode } from "@/components/map-tile-layers"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { draftOnuIcon, offlineOnuIcon, onlineOnuIcon } from "@/lib/map-markers"
import type { MapSettings, Onu } from "@shared/types"

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true })
  }, [lat, lng, map])
  return null
}

export function OnuLocationDialog({
  onu,
  oltName,
  mapSettings,
  open,
  onOpenChange,
  onSave,
  onClear,
}: {
  onu: Onu | null
  oltName: string
  mapSettings: MapSettings
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (onuId: string, lat: number, lng: number, note: string) => Promise<void>
  onClear: (onuId: string) => Promise<void>
}) {
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [note, setNote] = useState("")
  const [layer, setLayer] = useState<MapLayerMode>("satellite")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!onu) return
    setLat(onu.latitude != null ? String(onu.latitude) : "")
    setLng(onu.longitude != null ? String(onu.longitude) : "")
    setNote(onu.locationNote ?? "")
  }, [onu])

  const parsedLat = lat !== "" && Number.isFinite(Number(lat)) ? Number(lat) : null
  const parsedLng = lng !== "" && Number.isFinite(Number(lng)) ? Number(lng) : null
  const centerLat = parsedLat ?? mapSettings.defaultLat
  const centerLng = parsedLng ?? mapSettings.defaultLng

  async function handleSave() {
    if (!onu || parsedLat === null || parsedLng === null) return
    setSaving(true)
    try {
      await onSave(onu.id, parsedLat, parsedLng, note)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <span>Set Lokasi ONU: {onu?.name}</span>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="outline">{oltName}</Badge>
            <Badge variant="secondary" className="font-mono">
              PON {onu?.ponPort}:{onu?.onuIndex}
            </Badge>
            <Badge variant="secondary" className="font-mono">
              SN: {onu?.serialNumber}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Klik pada peta untuk menandai titik lokasi, geser marker, atau ketik koordinat manual.</p>
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

        <div className="isolate relative h-[340px] w-full overflow-hidden rounded-xl border">
          {open && (
            <MapContainer center={[centerLat, centerLng]} zoom={parsedLat ? 16 : mapSettings.defaultZoom} maxZoom={20} className="h-full w-full">
              <MapTileLayers layer={layer} />
              <MapClickHandler
                onPick={(pickedLat, pickedLng) => {
                  setLat(pickedLat.toFixed(6))
                  setLng(pickedLng.toFixed(6))
                }}
              />
              {parsedLat !== null && parsedLng !== null && (
                <>
                  <RecenterMap lat={parsedLat} lng={parsedLng} />
                  <Marker
                    position={[parsedLat, parsedLng]}
                    icon={onu ? (onu.status === "online" ? onlineOnuIcon : offlineOnuIcon) : draftOnuIcon}
                    draggable
                    eventHandlers={{
                      dragend(e) {
                        const pos = (e.target as L.Marker).getLatLng()
                        setLat(pos.lat.toFixed(6))
                        setLng(pos.lng.toFixed(6))
                      },
                    }}
                  />
                </>
              )}
            </MapContainer>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="onu-lat">Latitude</Label>
            <Input
              id="onu-lat"
              className="font-mono text-xs"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="-2.976100"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="onu-lng">Longitude</Label>
            <Input
              id="onu-lng"
              className="font-mono text-xs"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="104.775400"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="onu-note">Catatan Lokasi (opsional)</Label>
          <Textarea
            id="onu-note"
            className="min-h-[64px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: Tiang 04 / Rumah pagar biru dekat pertigaan"
          />
        </div>

        <Separator />

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {onu?.latitude != null ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm" disabled={saving}>
                  <Trash2 className="h-4 w-4" />
                  Hapus Titik
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus titik lokasi ONU?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Koordinat peta untuk <b>{onu.name}</b> akan dihapus dari SQLite. Anda bisa menandainya kembali kapan saja.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Batal</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      if (!onu) return
                      setSaving(true)
                      try {
                        await onClear(onu.id)
                        onOpenChange(false)
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    Hapus Titik
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="button" disabled={saving || parsedLat === null || parsedLng === null} onClick={handleSave}>
              <Save className="h-4 w-4" />
              {saving ? "Menyimpan..." : "Simpan Lokasi"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
