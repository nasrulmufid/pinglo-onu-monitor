import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMonitoring } from "@/context/monitoring-context"
import {
  downloadOnuLocationTemplate,
  parseOnuLocationSpreadsheet,
  type ParsedLocationRow,
} from "@/lib/onu-location-excel"
import { cn } from "@/lib/utils"
import type { BulkOnuLocationItem } from "@shared/types"

export function BulkLocationImportDialog({
  open,
  onOpenChange,
  defaultOltId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultOltId?: string
}) {
  const { state, bulkSaveOnuLocations } = useMonitoring()
  const { olts, onus } = state

  const [selectedOltId, setSelectedOltId] = useState("")
  const [includeExisting, setIncludeExisting] = useState(true)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedLocationRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [previewTab, setPreviewTab] = useState<"valid" | "error" | "all">("all")
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (defaultOltId && olts.some((o) => o.id === defaultOltId)) {
      setSelectedOltId(defaultOltId)
      return
    }
    setSelectedOltId((prev) => (prev && olts.some((o) => o.id === prev) ? prev : olts[0]?.id ?? ""))
  }, [open, defaultOltId, olts])

  const selectedOlt = useMemo(() => olts.find((o) => o.id === selectedOltId) ?? null, [olts, selectedOltId])
  const oltOnus = useMemo(() => (selectedOlt ? onus.filter((o) => o.oltId === selectedOlt.id) : []), [onus, selectedOlt])
  const unmappedCount = useMemo(() => oltOnus.filter((o) => o.latitude == null || o.longitude == null).length, [oltOnus])

  useEffect(() => {
    if (!uploadedFile) {
      setParsedRows([])
      setParseError(null)
      return
    }
    let active = true
    parseOnuLocationSpreadsheet(uploadedFile, oltOnus)
      .then((rows) => {
        if (!active) return
        setParsedRows(rows)
        setParseError(rows.length === 0 ? "File tidak berisi baris data ONU." : null)
        const hasValid = rows.some((r) => r.status === "valid")
        const hasError = rows.some((r) => r.status === "error")
        setPreviewTab(hasError && !hasValid ? "error" : "all")
      })
      .catch((err) => {
        if (!active) return
        setParsedRows([])
        setParseError(err instanceof Error ? err.message : "Gagal membaca file Excel.")
      })
    return () => {
      active = false
    }
  }, [uploadedFile, oltOnus])

  const validRows = useMemo(() => parsedRows.filter((r) => r.status === "valid"), [parsedRows])
  const skippedRows = useMemo(() => parsedRows.filter((r) => r.status === "skipped"), [parsedRows])
  const errorRows = useMemo(() => parsedRows.filter((r) => r.status === "error"), [parsedRows])

  const visibleRows = useMemo(() => {
    if (previewTab === "valid") return validRows
    if (previewTab === "error") return errorRows
    return parsedRows
  }, [previewTab, parsedRows, validRows, errorRows])

  function clearFile() {
    setUploadedFile(null)
    setParsedRows([])
    setParseError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      clearFile()
      setPreviewTab("all")
    }
    onOpenChange(nextOpen)
  }

  function handleDownload(format: "xlsx" | "xls") {
    if (!selectedOlt) return
    if (oltOnus.length === 0) {
      toast.error(`Belum ada data ONU pada ${selectedOlt.name}. Jalankan Poll ONU terlebih dahulu.`)
      return
    }
    downloadOnuLocationTemplate(selectedOlt, oltOnus, { format, includeExisting })
    toast.success(`Template .${format} untuk ${selectedOlt.name} (${oltOnus.length} ONU) berhasil diunduh.`)
  }

  function handleFilePicked(file: File | undefined) {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      toast.error("Format file harus .xls, .xlsx, atau .csv.")
      return
    }
    setUploadedFile(file)
  }

  async function handleSaveBulk() {
    if (!selectedOlt || validRows.length === 0 || saving) return
    setSaving(true)
    try {
      const items: BulkOnuLocationItem[] = validRows.map((r) => ({
        onuId: r.onuId,
        name: r.matchedName ?? r.name,
        serialNumber: r.serialNumber,
        longitude: r.longitude!,
        latitude: r.latitude!,
        locationNote: r.locationNote,
      }))
      const result = await bulkSaveOnuLocations(selectedOlt.id, items)
      if (result.ok) {
        handleClose(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="h-4 w-4" />
            </span>
            <span>Import Koordinat ONU Massal (XLS / XLSX)</span>
          </DialogTitle>
          <DialogDescription>
            Unduh template daftar ONU per OLT, isi kolom <b>longitude</b> dan <b>latitude</b> di Excel, lalu unggah kembali untuk memperbarui titik lokasi secara massal.
          </DialogDescription>
        </DialogHeader>

        {olts.length === 0 ? (
          <Alert variant="warning">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs">Belum ada OLT terdaftar</AlertTitle>
            <AlertDescription>Tambahkan OLT dan jalankan Poll ONU terlebih dahulu sebelum menggunakan fitur import.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/25 p-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">1. Pilih OLT &amp; Download Template</Label>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <Select value={selectedOltId} onValueChange={setSelectedOltId}>
                      <SelectTrigger className="w-[220px] bg-background">
                        <SelectValue placeholder="Pilih OLT" />
                      </SelectTrigger>
                      <SelectContent>
                        {olts.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="tabular-nums">
                      Total ONU: {oltOnus.length}
                    </Badge>
                    <Badge variant={unmappedCount > 0 ? "warning" : "success"} className="tabular-nums">
                      Belum diset: {unmappedCount}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={!selectedOlt || oltOnus.length === 0} onClick={() => handleDownload("xlsx")}>
                    <Download className="h-3.5 w-3.5" />
                    Download Template (.xlsx)
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={!selectedOlt || oltOnus.length === 0} onClick={() => handleDownload("xls")}>
                    <Download className="h-3.5 w-3.5" />
                    Download (.xls)
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <Switch id="include-existing-coords" checked={includeExisting} onCheckedChange={setIncludeExisting} />
                <Label htmlFor="include-existing-coords" className="cursor-pointer text-xs text-muted-foreground">
                  Sertakan koordinat &amp; catatan yang sudah tersimpan di template
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">2. Upload File Excel yang Sudah Diisi</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                className="hidden"
                onChange={(e) => handleFilePicked(e.target.files?.[0])}
              />

              {!uploadedFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    handleFilePicked(e.dataTransfer.files?.[0])
                  }}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors",
                    dragging ? "border-primary bg-primary/10" : "border-border bg-muted/15 hover:border-primary/50 hover:bg-muted/30",
                  )}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-primary">Klik untuk memilih file</span> atau seret file ke area ini
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Mendukung <b>.xls</b>, <b>.xlsx</b>, dan <b>.csv</b> dengan kolom <code className="font-mono">nama</code>, <code className="font-mono">SN</code>, <code className="font-mono">longitude</code>, <code className="font-mono">latitude</code>
                  </p>
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{uploadedFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {parsedRows.length} baris dibaca untuk OLT {selectedOlt?.name ?? "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                      Ganti File
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={clearFile} aria-label="Hapus file">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs">Gagal Memproses File</AlertTitle>
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            {parsedRows.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="success" className="gap-1 tabular-nums">
                      <CheckCircle2 className="h-3 w-3" />
                      Siap Disimpan: {validRows.length}
                    </Badge>
                    <Badge variant="secondary" className="tabular-nums">
                      Dilewati: {skippedRows.length}
                    </Badge>
                    <Badge variant={errorRows.length > 0 ? "destructive" : "outline"} className="tabular-nums">
                      Error: {errorRows.length}
                    </Badge>
                  </div>

                  <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as "valid" | "error" | "all")}>
                    <TabsList className="h-8">
                      <TabsTrigger value="all" className="h-6 text-xs">
                        Semua ({parsedRows.length})
                      </TabsTrigger>
                      <TabsTrigger value="valid" className="h-6 text-xs">
                        Siap ({validRows.length})
                      </TabsTrigger>
                      <TabsTrigger value="error" className="h-6 text-xs">
                        Error ({errorRows.length})
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <ScrollArea className="h-[220px] rounded-2xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">Baris</TableHead>
                        <TableHead>Nama ONU</TableHead>
                        <TableHead>SN</TableHead>
                        <TableHead>Longitude</TableHead>
                        <TableHead>Latitude</TableHead>
                        <TableHead>Status / Keterangan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                            Tidak ada baris pada tab ini.
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleRows.map((row) => (
                          <TableRow key={`${row.rowNumber}-${row.serialNumber}-${row.name}`}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{row.rowNumber}</TableCell>
                            <TableCell className="text-xs font-medium">{row.matchedName ?? (row.name || "-")}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{row.serialNumber || "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{row.longitude ?? (row.longitudeRaw || "-")}</TableCell>
                            <TableCell className="font-mono text-xs">{row.latitude ?? (row.latitudeRaw || "-")}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant={row.status === "valid" ? "success" : row.status === "error" ? "destructive" : "secondary"}
                                  className="text-[10px]"
                                >
                                  {row.status === "valid" ? "Valid" : row.status === "error" ? "Error" : "Lewati"}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">{row.reason}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        <Separator />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Batal
          </Button>
          <Button type="button" disabled={saving || !selectedOlt || validRows.length === 0} onClick={() => void handleSaveBulk()}>
            <Upload className="h-4 w-4" />
            {saving ? "Menyimpan..." : `Simpan ${validRows.length} Titik Koordinat`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
