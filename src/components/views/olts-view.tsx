import { useMemo, useState } from "react"
import {
  Activity,
  Bell,
  Clock,
  Info,
  Network,
  Pencil,
  Plus,
  RefreshCcw,
  Router,
  Save,
  Search,
  Trash2,
  Wifi,
  X,
} from "lucide-react"

import { MetricCard } from "@/components/metric-card"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMonitoring } from "@/context/monitoring-context"
import {
  emptyOltForm,
  formFromOlt,
  profileForVendor,
  vendorOptions,
  writeModeOptions,
  type OltForm,
} from "@/lib/monitoring-utils"
import { cn } from "@/lib/utils"
import { oidProfiles } from "@shared/oid-catalog"
import type { OidProfileKey, Olt } from "@shared/types"

export function OltsView() {
  const {
    state,
    pollingOltId,
    onlineOltCount,
    downOnuCount,
    openAlertCount,
    mappedOnuCount,
    saveOlt,
    removeOlt,
    testConnection,
    testWrite,
    pollOnu,
  } = useMonitoring()

  const { olts, onus } = state
  const [search, setSearch] = useState("")
  const [vendorFilter, setVendorFilter] = useState("all")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOltId, setEditingOltId] = useState<string | null>(null)
  const [form, setForm] = useState<OltForm>(emptyOltForm)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Olt | null>(null)
  const [infoSheetOlt, setInfoSheetOlt] = useState<Olt | null>(null)

  const filteredOlts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return olts.filter((olt) => {
      if (vendorFilter !== "all" && olt.vendor !== vendorFilter) return false
      if (q) {
        const hay = `${olt.name} ${olt.ipAddress} ${olt.vendor} ${olt.model} ${olt.location}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [olts, search, vendorFilter])

  function openAddDialog() {
    setEditingOltId(null)
    setForm(emptyOltForm)
    setDialogOpen(true)
  }

  function openEditDialog(olt: Olt) {
    setEditingOltId(olt.id)
    setForm(formFromOlt(olt))
    setDialogOpen(true)
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      const ok = await saveOlt(form, editingOltId)
      if (ok) {
        setDialogOpen(false)
        setEditingOltId(null)
        setForm(emptyOltForm)
      }
    } finally {
      setSaving(false)
    }
  }

  const infoEntries = infoSheetOlt?.systemInfo ? Object.entries(infoSheetOlt.systemInfo) : []

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="OLT Online"
          value={`${onlineOltCount}/${olts.length}`}
          detail="Berdasarkan polling SNMP terakhir"
          tone="cyan"
          icon={Network}
          progress={olts.length ? Math.round((onlineOltCount / olts.length) * 100) : 0}
        />
        <MetricCard
          label="Total ONU"
          value={String(onus.length)}
          detail={`${mappedOnuCount} sudah memiliki titik lokasi`}
          tone="emerald"
          icon={Activity}
        />
        <MetricCard
          label="ONU Down"
          value={String(downOnuCount)}
          detail="Offline / LOS pada polling terakhir"
          tone="amber"
          icon={Router}
        />
        <MetricCard
          label="Alert Terbuka"
          value={String(openAlertCount)}
          detail="Perlu perhatian teknisi"
          tone="red"
          icon={Bell}
        />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 pr-8"
              placeholder="Cari nama OLT, IP, vendor, atau model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Semua Vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Vendor</SelectItem>
              {vendorOptions.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={openAddDialog} className="ml-auto">
            <Plus className="h-4 w-4" />
            Tambah OLT
          </Button>
        </CardContent>
      </Card>

      {filteredOlts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Router className="h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-semibold">
              {olts.length === 0 ? "Belum ada perangkat OLT tersimpan" : "Tidak ada OLT yang cocok dengan filter"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {olts.length === 0
                ? "Tambahkan perangkat OLT pertama Anda untuk memulai koneksi SNMP dan polling ONU."
                : "Coba ubah kata kunci pencarian atau pilih filter vendor lain."}
            </p>
            {olts.length === 0 && (
              <Button className="mt-4" onClick={openAddDialog}>
                <Plus className="h-4 w-4" />
                Tambah OLT Baru
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredOlts.map((olt) => {
            const hasSystemInfo = Boolean(olt.systemInfo && Object.keys(olt.systemInfo).length > 0)
            const isPolling = pollingOltId === olt.id
            return (
              <Card key={olt.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-center">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold tracking-tight">{olt.name}</span>
                      <StatusBadge value={olt.status} />
                      <Badge variant="outline">{olt.vendor}</Badge>
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {olt.oidProfile}
                      </Badge>
                      <Badge variant="outline" className="text-[11px] uppercase">
                        Write: {olt.writeMode}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground/90">
                        {olt.ipAddress}:{olt.snmpPort}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Interval {olt.pollingInterval}s
                      </span>
                      <span>
                        ONU Aktif: <b className="text-foreground tabular-nums">{olt.activeOnu}</b>
                      </span>
                      {olt.model && olt.model !== "-" && <span>Model: {olt.model}</span>}
                      {olt.location && olt.location !== "-" && <span>Lokasi: {olt.location}</span>}
                      <span>Last seen: {olt.lastSeen}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" disabled={isPolling} onClick={() => void pollOnu(olt)}>
                      <RefreshCcw className={cn("h-3.5 w-3.5", isPolling && "animate-spin")} />
                      {isPolling ? "Polling..." : "Poll ONU"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void testConnection(olt)}>
                      <Wifi className="h-3.5 w-3.5" />
                      Test
                    </Button>
                    {olt.oidProfile === "hsgq-gpon" && olt.writeMode === "snmp" && (
                      <Button size="sm" variant="outline" onClick={() => void testWrite(olt)}>
                        Test Write
                      </Button>
                    )}
                    {hasSystemInfo && (
                      <Button size="sm" variant="secondary" onClick={() => setInfoSheetOlt(olt)}>
                        <Info className="h-3.5 w-3.5" />
                        Info SNMP
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(olt)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(olt)}
                          aria-label={`Hapus ${olt.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Hapus OLT</TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            setEditingOltId(null)
            setForm(emptyOltForm)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Router className="h-4 w-4 text-primary" />
              {editingOltId ? "Edit OLT" : "Tambah OLT Baru"}
            </DialogTitle>
            <DialogDescription>
              Konfigurasi koneksi SNMP, profil OID vendor, dan interval polling untuk perangkat OLT.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSubmit()
            }}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="olt-name">Nama OLT</Label>
                <Input
                  id="olt-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="OLT-AREA-01"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="olt-ip">IP / Host</Label>
                <Input
                  id="olt-ip"
                  className="font-mono"
                  value={form.ipAddress}
                  onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
                  placeholder="192.168.1.10"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Select
                  value={form.vendor}
                  onValueChange={(v) => {
                    const vendor = v as Olt["vendor"]
                    setForm({ ...form, vendor, oidProfile: profileForVendor(vendor) })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorOptions.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Profil OID</Label>
                <Select value={form.oidProfile} onValueChange={(v) => setForm({ ...form, oidProfile: v as OidProfileKey })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {oidProfiles.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Mode Rename</Label>
                <Select value={form.writeMode} onValueChange={(v) => setForm({ ...form, writeMode: v as Olt["writeMode"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {writeModeOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="olt-port">Port SNMP</Label>
                <Input
                  id="olt-port"
                  className="font-mono"
                  value={form.snmpPort}
                  onChange={(e) => setForm({ ...form, snmpPort: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="olt-interval">Interval Polling (detik)</Label>
                <Input
                  id="olt-interval"
                  className="font-mono"
                  value={form.pollingInterval}
                  onChange={(e) => setForm({ ...form, pollingInterval: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="olt-read">Read Community</Label>
                <Input
                  id="olt-read"
                  value={form.readCommunity}
                  onChange={(e) => setForm({ ...form, readCommunity: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="olt-write">Write Community (opsional)</Label>
                <Input
                  id="olt-write"
                  value={form.writeCommunity}
                  onChange={(e) => setForm({ ...form, writeCommunity: e.target.value })}
                  placeholder="private"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {editingOltId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {saving ? "Menyimpan..." : editingOltId ? "Simpan Perubahan" : "Simpan OLT"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus OLT {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh data ONU/ONT dan riwayat alert yang terhubung dengan OLT ini juga akan dihapus dari SQLite. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) void removeOlt(deleteTarget)
                setDeleteTarget(null)
              }}
            >
              Ya, Hapus OLT
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={Boolean(infoSheetOlt)} onOpenChange={(open) => !open && setInfoSheetOlt(null)}>
        <SheetContent side="right" className="flex flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              System Info SNMP — {infoSheetOlt?.name}
            </SheetTitle>
            <SheetDescription>
              Hasil pembacaan OID sistem terakhir dari{" "}
              <span className="font-mono">
                {infoSheetOlt?.ipAddress}:{infoSheetOlt?.snmpPort}
              </span>
            </SheetDescription>
          </SheetHeader>
          <Separator className="my-3" />
          <ScrollArea className="flex-1 pr-3">
            {infoEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Belum ada data system info SNMP.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OID</TableHead>
                      <TableHead>Nilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {infoEntries.map(([oid, value]) => (
                      <TableRow key={oid}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">{oid}</TableCell>
                        <TableCell className="break-all text-xs font-medium">{value || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}
