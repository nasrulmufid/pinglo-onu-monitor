import { readSheet } from "read-excel-file/browser"
import writeXlsxFile, { type SheetData } from "write-excel-file/browser"

import type { Olt, Onu } from "@shared/types"

export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024
export const MAX_SPREADSHEET_ROWS = 5000

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

/** Neutralizes potential spreadsheet formula injection prefixes on string cells. */
export function sanitizeSpreadsheetCell(value: string): string {
  const clean = value ?? ""
  return /^[=+\-@\t\r]/.test(clean) ? `'${clean}` : clean
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n;]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

function triggerTextDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadOnuLocationTemplate(
  olt: Olt,
  onus: Onu[],
  options: { format: "xlsx" | "csv"; includeExisting: boolean },
) {
  const slug =
    olt.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "olt"

  if (options.format === "csv") {
    const lines = [
      TEMPLATE_HEADERS.join(","),
      ...onus.map((onu) => {
        const lng = options.includeExisting && onu.longitude != null ? String(onu.longitude) : ""
        const lat = options.includeExisting && onu.latitude != null ? String(onu.latitude) : ""
        const note = options.includeExisting && onu.locationNote ? sanitizeSpreadsheetCell(onu.locationNote) : ""
        return [
          escapeCsvCell(sanitizeSpreadsheetCell(onu.name)),
          escapeCsvCell(sanitizeSpreadsheetCell(onu.serialNumber || "-")),
          lng,
          lat,
          escapeCsvCell(note),
        ].join(",")
      }),
    ]
    triggerTextDownload(`template-koordinat-${slug}.csv`, `\uFEFF${lines.join("\r\n")}`, "text/csv;charset=utf-8")
    return
  }

  const sheetData: SheetData = [
    TEMPLATE_HEADERS.map((h) => ({ value: h, fontWeight: "bold" as const })),
    ...onus.map((onu) => {
      const hasLng = options.includeExisting && onu.longitude != null && Number.isFinite(onu.longitude)
      const hasLat = options.includeExisting && onu.latitude != null && Number.isFinite(onu.latitude)
      const note = options.includeExisting && onu.locationNote ? onu.locationNote : ""
      return [
        { value: sanitizeSpreadsheetCell(onu.name), type: String },
        { value: sanitizeSpreadsheetCell(onu.serialNumber || "-"), type: String },
        hasLng ? { value: onu.longitude!, type: Number } : null,
        hasLat ? { value: onu.latitude!, type: Number } : null,
        note ? { value: sanitizeSpreadsheetCell(note), type: String } : null,
      ]
    }),
  ]

  await writeXlsxFile(sheetData, {
    sheet: "Koordinat ONU",
    columns: [{ width: 28 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 28 }],
  }).toFile(`template-koordinat-${slug}.xlsx`)
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
  for (const alias of aliases) {
    if (alias in row) return row[alias]
  }
  return undefined
}

function detectCsvDelimiter(firstLine: string): "," | ";" {
  let commaCount = 0
  let semiCount = 0
  let inQuotes = false
  for (let i = 0; i < firstLine.length; i += 1) {
    const ch = firstLine[i]
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === ",") commaCount += 1
    else if (!inQuotes && ch === ";") semiCount += 1
  }
  return semiCount > commaCount ? ";" : ","
}

function parseCsvMatrix(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, "")
  const firstBreak = text.search(/\r?\n/)
  const headerLine = firstBreak === -1 ? text : text.slice(0, firstBreak)
  const delimiter = detectCsvDelimiter(headerLine)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ""
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      if (rows.length > MAX_SPREADSHEET_ROWS + 1) {
        throw new Error(`Jumlah baris melebihi batas maksimum ${MAX_SPREADSHEET_ROWS} baris.`)
      }
    } else {
      cell += ch
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.some((v) => v.trim() !== ""))
}

export async function parseOnuLocationSpreadsheet(file: File, oltOnus: Onu[]): Promise<ParsedLocationRow[]> {
  if (file.size > MAX_SPREADSHEET_BYTES) {
    throw new Error("Ukuran file melebihi batas maksimum 5 MB.")
  }

  const lower = file.name.toLowerCase()
  if (lower.endsWith(".xls")) {
    throw new Error("Format .xls lama (Excel 97–2003) tidak didukung. Gunakan format .xlsx atau .csv.")
  }

  let matrix: unknown[][]
  if (lower.endsWith(".csv")) {
    matrix = parseCsvMatrix(await file.text())
  } else if (lower.endsWith(".xlsx")) {
    matrix = await readSheet(file)
  } else {
    throw new Error("Format file tidak didukung. Gunakan .xlsx atau .csv.")
  }

  if (matrix.length === 0) {
    throw new Error("File spreadsheet kosong atau tidak memiliki worksheet.")
  }
  if (matrix.length - 1 > MAX_SPREADSHEET_ROWS) {
    throw new Error(`Jumlah baris data melebihi batas maksimum ${MAX_SPREADSHEET_ROWS} baris.`)
  }

  const headerKeys = matrix[0].map((cell) => normalizeHeaderKey(String(cell ?? "")))
  const dataRows = matrix.slice(1).filter((r) => r.some((cell) => cell != null && String(cell).trim() !== ""))

  const bySn = new Map<string, Onu>()
  const byName = new Map<string, Onu>()
  for (const onu of oltOnus) {
    const sn = onu.serialNumber?.trim().toUpperCase()
    if (sn && sn !== "-") bySn.set(sn, onu)
    const nm = onu.name?.trim().toLowerCase()
    if (nm) byName.set(nm, onu)
  }

  return dataRows.map((cells, index) => {
    const rowNumber = index + 2
    const rowObj: Record<string, unknown> = {}
    headerKeys.forEach((key, colIdx) => {
      if (key) rowObj[key] = cells[colIdx]
    })

    const nameRaw = pickField(rowObj, ["nama", "name", "namaonu", "namapelanggan", "onu"])
    const snRaw = pickField(rowObj, ["sn", "serial", "serialnumber", "serialno"])
    const lngRaw = pickField(rowObj, ["longitude", "lng", "lon", "long"])
    const latRaw = pickField(rowObj, ["latitude", "lat"])
    const noteRaw = pickField(rowObj, ["catatan", "note", "locationnote", "keterangan"])

    const name = nameRaw != null ? String(nameRaw).trim() : ""
    const serialNumber = snRaw != null ? String(snRaw).trim() : ""
    const longitudeRaw = lngRaw != null ? String(lngRaw).trim() : ""
    const latitudeRaw = latRaw != null ? String(latRaw).trim() : ""
    const locationNote = noteRaw !== undefined && noteRaw !== null ? String(noteRaw).trim().slice(0, 300) : undefined

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
