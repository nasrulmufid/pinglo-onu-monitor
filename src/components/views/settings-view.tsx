import { useEffect, useState } from "react"
import { Copy, Database, Map, Radio, Save } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMonitoring } from "@/context/monitoring-context"
import { oidProfiles } from "@shared/oid-catalog"

export function SettingsView() {
  const { state, saveMapSettings } = useMonitoring()
  const mapSettings = state.settings.map

  const [lat, setLat] = useState(String(mapSettings.defaultLat))
  const [lng, setLng] = useState(String(mapSettings.defaultLng))
  const [zoom, setZoom] = useState(String(mapSettings.defaultZoom))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLat(String(mapSettings.defaultLat))
    setLng(String(mapSettings.defaultLng))
    setZoom(String(mapSettings.defaultZoom))
  }, [mapSettings])

  async function handleSaveMap() {
    const parsedLat = Number(lat)
    const parsedLng = Number(lng)
    const parsedZoom = Number(zoom)
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || !Number.isFinite(parsedZoom)) {
      toast.error("Koordinat dan Zoom harus berupa angka yang valid.")
      return
    }
    setSaving(true)
    try {
      await saveMapSettings({ defaultLat: parsedLat, defaultLng: parsedLng, defaultZoom: parsedZoom })
    } finally {
      setSaving(false)
    }
  }

  function copyOid(oid: string) {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(oid)
      toast.success(`OID ${oid} disalin ke clipboard.`)
    }
  }

  return (
    <Tabs defaultValue="map" className="space-y-4">
      <div className="no-scrollbar w-full overflow-x-auto pb-0.5">
        <TabsList className="w-max flex-nowrap">
          <TabsTrigger value="map">
            <Map className="h-3.5 w-3.5" />
            Peta Default
          </TabsTrigger>
          <TabsTrigger value="oid">
            <Radio className="h-3.5 w-3.5" />
            Profil OID &amp; Collector SNMP
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="map">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pengaturan Default Peta</CardTitle>
              <CardDescription>
                Titik tengah awal dan level zoom saat membuka halaman Map ONU serta dialog Set Lokasi.
              </CardDescription>
            </CardHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSaveMap()
              }}
            >
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="default-lat">Default Latitude</Label>
                    <Input
                      id="default-lat"
                      className="font-mono"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      placeholder="-2.9761"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="default-lng">Default Longitude</Label>
                    <Input
                      id="default-lng"
                      className="font-mono"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      placeholder="104.7754"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="default-zoom">Default Zoom (2 - 20)</Label>
                  <Input
                    id="default-zoom"
                    className="font-mono"
                    value={zoom}
                    onChange={(e) => setZoom(e.target.value)}
                    placeholder="12"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? "Menyimpan..." : "Simpan Pengaturan Peta"}
                </Button>
              </CardFooter>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Penyimpanan &amp; Collector SNMP
              </CardTitle>
              <CardDescription>Ringkasan engine penyimpanan lokal dan profil perangkat yang didukung.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="info">
                <Database className="h-4 w-4" />
                <AlertTitle className="text-xs">Database SQLite Lokal</AlertTitle>
                <AlertDescription>
                  Seluruh data OLT, ONU/ONT (termasuk koordinat peta), alert, dan pengaturan disimpan di{" "}
                  <code className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[11px]">data/mikroin-monitor.db</code>.
                </AlertDescription>
              </Alert>

              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Profil OID Aktif:</p>
                <div className="flex flex-wrap gap-2">
                  {oidProfiles.map((p) => (
                    <Badge key={p.key} variant="outline" className="gap-1.5 py-1">
                      <span>{p.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{p.items.length} OID</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="oid">
        <Card>
          <CardHeader>
            <CardTitle>Katalog Profil OID SNMP</CardTitle>
            <CardDescription>Daftar OID yang dibaca collector untuk setiap vendor dan profil OLT.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={oidProfiles[0].key}>
              <div className="no-scrollbar w-full overflow-x-auto pb-0.5">
                <TabsList className="w-max flex-nowrap justify-start gap-1">
                  {oidProfiles.map((profile) => (
                    <TabsTrigger key={profile.key} value={profile.key}>
                      {profile.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {oidProfiles.map((profile) => (
                <TabsContent key={profile.key} value={profile.key} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Key profil:</span>
                    <Badge variant="secondary" className="font-mono">
                      {profile.key}
                    </Badge>
                    {profile.enterpriseRoot && (
                      <>
                        <span>Enterprise Root:</span>
                        <Badge variant="outline" className="font-mono">
                          {profile.enterpriseRoot}
                        </Badge>
                      </>
                    )}
                  </div>

                  <div className="space-y-2 sm:hidden">
                    {profile.items.map((item) => (
                      <div key={`mob-${profile.key}-${item.key}`} className="flex items-start justify-between gap-2 rounded-xl border bg-muted/15 p-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold">{item.label}</span>
                            <Badge
                              variant={
                                item.kind === "optical"
                                  ? "info"
                                  : item.kind === "ont"
                                    ? "success"
                                    : item.kind === "system"
                                      ? "secondary"
                                      : "outline"
                              }
                              className="text-[10px] uppercase"
                            >
                              {item.kind}
                            </Badge>
                          </div>
                          <p className="break-all font-mono text-[11px] text-muted-foreground">{item.oid}</p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0"
                          onClick={() => copyOid(item.oid)}
                          aria-label={`Salin ${item.oid}`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="hidden overflow-hidden rounded-xl border sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Label</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>OID</TableHead>
                          <TableHead className="text-right">Salin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.items.map((item) => (
                          <TableRow key={`${profile.key}-${item.key}`}>
                            <TableCell className="text-xs font-medium">{item.label}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  item.kind === "optical"
                                    ? "info"
                                    : item.kind === "ont"
                                      ? "success"
                                      : item.kind === "system"
                                        ? "secondary"
                                        : "outline"
                                }
                                className="text-[10px] uppercase"
                              >
                                {item.kind}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{item.oid}</TableCell>
                            <TableCell className="text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => copyOid(item.oid)}
                                    aria-label={`Salin ${item.oid}`}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Salin OID</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
