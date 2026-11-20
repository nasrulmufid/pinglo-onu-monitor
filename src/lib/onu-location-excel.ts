import * as XLSX from "xlsx"

import type { Olt, Onu } from "@shared/types"

export type ParsedLocationRow = {
  rowNumber: number
  name: string
  serialNumber: string
  longitudeRaw: string
  latitudeRaw: string
  longitude: number | null
  latitude: number | null
  locationNote?: string
  onuId?: string
  matchedName?: string
  status: "valid" | "skipped" | "error"
  reason: string
}

const TEMPLATE_HEADERS = ["nama", "SN", "longitude", "latitude", "catatan"]

export function downloadOnuLocationTemplate(
  olt: Olt,
  onus: Onu[],
  options: { format: "xlsx" | "xls"; includeExisting: boolean },
) {
  const rows = onus.map((onu) => ({
    nama: onu.name,
    SN: onu.serialNumber,
    longitude: options.includeExisting && onu.longitude != null ? onu.longitude : "",
    latitude: options.includeExisting && onu.latitude != null ? onu.latitude : "",
    catatan: options.includeExisting && onu.locationNote ? onu.locationNote : "",
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: TEMPLATE_HEADERS })
  worksheet["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 28 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, "Koordinat ONU")

  const slug =
    olt.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "olt"

  XLSX.writeFile(workbook, `template-koordinat-${slug}.${options.format}`, {
    bookType: options.format === "xls" ? "biff8" : "xlsx",
  })
}

export function parseCoordinateValue(raw: unknown): { empty: boolean; value: number | null } {
  if (raw == null) return { empty: true, value: null }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { empty: false, value: raw } : { empty: false, value: null }
  }
  const trimmed = String(raw).trim()
  if (trimmed === "") return { empty: true, value: null }

  const normalized = trimmed.includes(",") && !trimmed.includes(".") ? trimmed.replace(",", ".") : trimmed
  if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) {
    return { empty: false, value: null }
  }
  const num = Number(normalized)
  return Number.isFinite(num) ? { empty: false, value: num } : { empty: false, value: null }
}

function normalizeHeaderKey(key: string) {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, "")
}

function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedEntries = Object.entries(row).map(([k, v]) => [normalizeHeaderKey(k), v] as const)
  for (const alias of aliases) {
    const match = normalizedEntries.find(([k]) => k === alias)
    if (match !== undefined) return match[1]
  }
  return undefined
}

export async function parseOnuLocationSpreadsheet(file: File, oltOnus: Onu[]): Promise<ParsedLocationRow[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error("File spreadsheet kosong atau tidak memiliki worksheet.")
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })

  const bySn = new Map<string, Onu>()
  const byName = new Map<string, Onu>()
  for (const onu of oltOnus) {
    const sn = onu.serialNumber?.trim().toUpperCase()
    if (sn && sn !== "-") bySn.set(sn, onu)
    const nm = onu.name?.trim().toLowerCase()
    if (nm) byName.set(nm, onu)
  }

  return rawRows.map((row, index) => {
    const rowNumber = index + 2
    const nameRaw = pickField(row, ["nama", "name", "namaonu", "namapelanggan", "onu"])
    const snRaw = pickField(row, ["sn", "serial", "serialnumber", "serialno"])
    const lngRaw = pickField(row, ["longitude", "lng", "lon", "long"])
    const latRaw = pickField(row, ["latitude", "lat"])
    const noteRaw = pickField(row, ["catatan", "note", "locationnote", "keterangan"])

    const name = nameRaw != null ? String(nameRaw).trim() : ""
    const serialNumber = snRaw != null ? String(snRaw).trim() : ""
    const longitudeRaw = lngRaw != null ? String(lngRaw).trim() : ""
    const latitudeRaw = latRaw != null ? String(latRaw).trim() : ""
    const locationNote = noteRaw !== undefined ? String(noteRaw).trim() : undefined

    const parsedLng = parseCoordinateValue(lngRaw)
    const parsedLat = parseCoordinateValue(latRaw)

    const snKey = serialNumber.toUpperCase()
    const nameKey = name.toLowerCase()
    const matched = (snKey && snKey !== "-" ? bySn.get(snKey) : undefined) ?? (nameKey ? byName.get(nameKey) : undefined)

    if (parsedLng.empty && parsedLat.empty) {
      return {
        rowNumber,
        name,
        serialNumber,
        longitudeRaw,
        latitudeRaw,
        longitude: null,
        latitude: null,
        locationNote,
        onuId: matched?.id,
        matchedName: matched?.name,
        status: "skipped",
        reason: "Koordinat kosong — dilewati",
      }
    }

    if (parsedLng.empty || parsedLat.empty) {
      return {
        rowNumber,
        name,
        serialNumber,
        longitudeRaw,
        latitudeRaw,
        longitude: parsedLng.value,
        latitude: parsedLat.value,
        locationNote,
        onuId: matched?.id,
        matchedName: matched?.name,
        status: "error",
        reason: "Longitude dan Latitude harus diisi keduanya",
      }
    }

    if (parsedLat.value == null || parsedLng.value == null) {
      return {
        rowNumber,
        name,
        serialNumber,
        longitudeRaw,
        latitudeRaw,
        longitude: parsedLng.value,
        latitude: parsedLat.value,
        locationNote,
        onuId: matched?.id,
        matchedName: matched?.name,
        status: "error",
        reason: "Format koordinat tidak valid",
      }
    }

    if (parsedLat.value < -90 || parsedLat.value > 90 || parsedLng.value < -180 || parsedLng.value > 180) {
      const swappedHint = Math.abs(parsedLat.value) > 90 && Math.abs(parsedLng.value) <= 90
      return {
        rowNumber,
        name,
        serialNumber,
        longitudeRaw,
        latitudeRaw,
        longitude: parsedLng.value,
        latitude: parsedLat.value,
        locationNote,
        onuId: matched?.id,
        matchedName: matched?.name,
        status: "error",
        reason: swappedHint
          ? "Kemungkinan kolom longitude dan latitude tertukar"
          : "Koordinat di luar jangkauan (Lat -90..90, Lng -180..180)",
      }
    }

    if (!matched) {
      return {
        rowNumber,
        name,
        serialNumber,
        longitudeRaw,
        latitudeRaw,
        longitude: parsedLng.value,
        latitude: parsedLat.value,
        locationNote,
        status: "error",
        reason: "ONU tidak ditemukan pada OLT terpilih",
      }
    }

    return {
      rowNumber,
      name,
      serialNumber,
      longitudeRaw,
      latitudeRaw,
      longitude: parsedLng.value,
      latitude: parsedLat.value,
      locationNote,
      onuId: matched.id,
      matchedName: matched.name,
      status: "valid",
      reason: "Siap disimpan",
    }
  })
}
