import type { Alert, BulkOnuLocationItem, BulkOnuLocationResult, MapSettings, MonitoringState, Olt, Onu } from "../shared/types"
import { decryptSecret, encryptSecret } from "./crypto-utils"
import { db, defaultMapSettings, recordAuditLog, runTransaction } from "./db"

type OltRow = {
  id: string
  name: string
  ip_address: string
  vendor: Olt["vendor"]
  model: string
  location: string
  status: Olt["status"]
  uptime: string
  cpu_load: number
  memory_load: number
  pon_ports: number
  active_onu: number
  polling_interval: number
  snmp_version: Olt["snmpVersion"]
  snmp_port: number
  read_community: string
  write_community: string | null
  oid_profile: Olt["oidProfile"]
  write_mode: Olt["writeMode"]
  last_seen: string
  system_info: string | null
}

type OnuRow = {
  id: string
  olt_id: string
  name: string
  serial_number: string
  pon_port: string
  onu_index: string
  status: Onu["status"]
  rx_power: number
  tx_power: number
  temperature_c: number | null
  down_reason: string | null
  distance_meters: number
  last_seen: string
  sync_status: Onu["syncStatus"]
  latitude: number | null
  longitude: number | null
  location_note: string | null
  location_updated_at: string | null
}

type AlertRow = {
  id: string
  olt_id: string
  title: string
  detail: string
  severity: Alert["severity"]
  created_at: string
  acknowledged: number
}

export type OltMutationInput = {
  name?: string
  ipAddress?: string
  vendor?: Olt["vendor"]
  oidProfile?: Olt["oidProfile"]
  writeMode?: Olt["writeMode"]
  snmpPort?: number
  pollingInterval?: number
  readCommunity?: string
  writeCommunity?: string
  clearWriteCommunity?: boolean
}

const VALID_VENDORS = new Set<Olt["vendor"]>(["VSOL", "HSGQ GPON", "HSGQ EPON", "Huawei", "ZTE", "FiberHome", "Other"])
const VALID_PROFILES = new Set<Olt["oidProfile"]>(["vsol-gpon", "hsgq-gpon", "hsgq-epon", "generic"])
const VALID_WRITE_MODES = new Set<Olt["writeMode"]>(["none", "snmp", "cli", "api"])
const MAX_BULK_ITEMS = 2000

function rowToOlt(r: OltRow, includeSecrets = false): Olt {
  let systemInfo: Record<string, string> | undefined
  if (r.system_info) {
    try {
      systemInfo = JSON.parse(r.system_info) as Record<string, string>
    } catch {
      systemInfo = undefined
    }
  }
  const plainRead = decryptSecret(r.read_community)
  const plainWrite = decryptSecret(r.write_community)

  return {
    id: r.id,
    name: r.name,
    ipAddress: r.ip_address,
    vendor: r.vendor,
    model: r.model,
    location: r.location,
    status: r.status,
    uptime: r.uptime,
    cpuLoad: r.cpu_load,
    memoryLoad: r.memory_load,
    ponPorts: r.pon_ports,
    activeOnu: r.active_onu,
    pollingInterval: r.polling_interval,
    snmpVersion: r.snmp_version,
    snmpPort: r.snmp_port,
    readCommunity: includeSecrets ? plainRead : "",
    writeCommunity: includeSecrets ? plainWrite : "",
    hasReadCommunity: Boolean(plainRead),
    hasWriteCommunity: Boolean(plainWrite),
    oidProfile: r.oid_profile,
    writeMode: r.write_mode,
    lastSeen: r.last_seen,
    systemInfo,
  }
}

function rowToOnu(r: OnuRow): Onu {
  return {
    id: r.id,
    oltId: r.olt_id,
    name: r.name,
    serialNumber: r.serial_number,
    ponPort: r.pon_port,
    onuIndex: r.onu_index,
    status: r.status,
    rxPower: r.rx_power,
    txPower: r.tx_power,
    temperatureC: r.temperature_c,
    downReason: r.down_reason,
    distanceMeters: r.distance_meters,
    lastSeen: r.last_seen,
    syncStatus: r.sync_status,
    latitude: r.latitude,
    longitude: r.longitude,
    locationNote: r.location_note,
    locationUpdatedAt: r.location_updated_at,
  }
}

function rowToAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    oltId: r.olt_id,
    title: r.title,
    detail: r.detail,
    severity: r.severity,
    createdAt: r.created_at,
    acknowledged: Boolean(r.acknowledged),
  }
}

export function getMapSettings(): MapSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'map'").get() as { value: string } | undefined
  if (!row) return { ...defaultMapSettings }
  try {
    const p = JSON.parse(row.value) as Partial<MapSettings>
    return {
      defaultLat: Number.isFinite(p.defaultLat) ? Number(p.defaultLat) : defaultMapSettings.defaultLat,
      defaultLng: Number.isFinite(p.defaultLng) ? Number(p.defaultLng) : defaultMapSettings.defaultLng,
      defaultZoom: Number.isFinite(p.defaultZoom) ? Number(p.defaultZoom) : defaultMapSettings.defaultZoom,
    }
  } catch {
    return { ...defaultMapSettings }
  }
}

export function saveMapSettings(next: MapSettings, actor?: string): MapSettings {
  const norm: MapSettings = {
    defaultLat: Math.max(-90, Math.min(90, Number(next.defaultLat) || defaultMapSettings.defaultLat)),
    defaultLng: Math.max(-180, Math.min(180, Number(next.defaultLng) || defaultMapSettings.defaultLng)),
    defaultZoom: Math.max(2, Math.min(20, Math.round(Number(next.defaultZoom) || defaultMapSettings.defaultZoom))),
  }
  db.prepare(`INSERT INTO settings (key, value) VALUES ('map', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    JSON.stringify(norm),
  )
  if (actor) {
    recordAuditLog(actor, "settings_map_update", `Default peta diatur ke ${norm.defaultLat}, ${norm.defaultLng} (zoom ${norm.defaultZoom}).`)
  }
  return norm
}

export const emptyMonitoringState: MonitoringState = {
  olts: [],
  onus: [],
  alerts: [],
  settings: { map: { ...defaultMapSettings } },
}

function markOltOnusOffline(oltId: string) {
  db.prepare(
    `UPDATE onus
     SET status = 'offline',
         down_reason = CASE
           WHEN status = 'online' THEN 'OLT offline'
           WHEN down_reason IS NULL OR TRIM(down_reason) = '' THEN 'OLT offline'
           ELSE down_reason
         END
     WHERE olt_id = ?`,
  ).run(oltId)
}

/** Returns public monitoring state with SNMP community secrets masked. */
export function readMonitoringState(): MonitoringState {
  const olts = (db.prepare("SELECT * FROM olts ORDER BY rowid ASC").all() as OltRow[]).map((r) => rowToOlt(r, false))
  const onus = (db.prepare("SELECT * FROM onus ORDER BY CAST(pon_port AS INTEGER) ASC, CAST(onu_index AS INTEGER) ASC").all() as OnuRow[]).map(rowToOnu)
  const alerts = (db.prepare("SELECT * FROM alerts ORDER BY sort_order DESC LIMIT 300").all() as AlertRow[]).map(rowToAlert)

  const offlineOltIds = new Set(olts.filter((o) => o.status === "offline").map((o) => o.id))
  if (offlineOltIds.size === 0) {
    return { olts, onus, alerts, settings: { map: getMapSettings() } }
  }

  const normalizedOlts = olts.map((o) => (offlineOltIds.has(o.id) ? { ...o, activeOnu: 0 } : o))
  const normalizedOnus = onus.map((onu) => {
    if (!offlineOltIds.has(onu.oltId)) return onu
    return {
      ...onu,
      status: "offline" as const,
      downReason: onu.status === "online" ? "OLT offline" : onu.downReason || "OLT offline",
    }
  })

  return { olts: normalizedOlts, onus: normalizedOnus, alerts, settings: { map: getMapSettings() } }
}

/** Returns a single OLT record with decrypted SNMP secrets strictly for backend SNMP calls. */
export function getOltWithSecrets(oltId: string): Olt | null {
  if (!oltId) return null
  const row = db.prepare("SELECT * FROM olts WHERE id = ?").get(oltId) as OltRow | undefined
  return row ? rowToOlt(row, true) : null
}

function validateOltInput(input: OltMutationInput, requireReadCommunity: boolean) {
  const name = input.name?.trim() ?? ""
  const ipAddress = input.ipAddress?.trim() ?? ""
  const vendor = input.vendor ?? "VSOL"
  const oidProfile = input.oidProfile ?? "vsol-gpon"
  const writeMode = input.writeMode ?? "none"
  const snmpPort = Number(input.snmpPort ?? 161)
  const pollingInterval = Number(input.pollingInterval ?? 60)
  const readCommunity = input.readCommunity?.trim() ?? ""
  const writeCommunity = input.writeCommunity?.trim() ?? ""

  if (!name || name.length > 80) return { ok: false as const, message: "Nama OLT wajib diisi (maks 80 karakter)." }
  if (!ipAddress || ipAddress.length > 253) return { ok: false as const, message: "IP/Host OLT wajib diisi." }
  if (!VALID_VENDORS.has(vendor)) return { ok: false as const, message: "Vendor OLT tidak valid." }
  if (!VALID_PROFILES.has(oidProfile)) return { ok: false as const, message: "Profil OID tidak valid." }
  if (!VALID_WRITE_MODES.has(writeMode)) return { ok: false as const, message: "Mode write tidak valid." }
  if (!Number.isInteger(snmpPort) || snmpPort < 1 || snmpPort > 65535) {
    return { ok: false as const, message: "Port SNMP harus antara 1 dan 65535." }
  }
  if (!Number.isInteger(pollingInterval) || pollingInterval < 10 || pollingInterval > 3600) {
    return { ok: false as const, message: "Interval polling harus antara 10 dan 3600 detik." }
  }
  if (requireReadCommunity && !readCommunity) {
    return { ok: false as const, message: "Read Community SNMP wajib diisi." }
  }
  if (readCommunity.length > 128 || writeCommunity.length > 128) {
    return { ok: false as const, message: "SNMP community maksimal 128 karakter." }
  }

  return {
    ok: true as const,
    data: {
      name,
      ipAddress,
      vendor,
      oidProfile,
      writeMode,
      snmpPort,
      pollingInterval,
      readCommunity,
      writeCommunity,
      clearWriteCommunity: Boolean(input.clearWriteCommunity),
    },
  }
}

export function createOlt(input: OltMutationInput, actor: string) {
  const checked = validateOltInput(input, true)
  if (!checked.ok) return { ok: false as const, message: checked.message }
  const d = checked.data
  const id = `olt-${Date.now()}`

  runTransaction(() => {
    db.prepare(
      `INSERT INTO olts (
        id, name, ip_address, vendor, model, location, status, uptime,
        cpu_load, memory_load, pon_ports, active_onu, polling_interval,
        snmp_version, snmp_port, read_community, write_community,
        oid_profile, write_mode, last_seen, system_info
      ) VALUES (?, ?, ?, ?, '-', '-', 'offline', '-', 0, 0, 0, 0, ?, 'v2c', ?, ?, ?, ?, ?, 'Belum pernah dipolling', NULL)`,
    ).run(
      id,
      d.name,
      d.ipAddress,
      d.vendor,
      d.pollingInterval,
      d.snmpPort,
      encryptSecret(d.readCommunity),
      encryptSecret(d.writeCommunity),
      d.oidProfile,
      d.writeMode,
    )
    recordAuditLog(actor, "olt_create", `OLT ${d.name} (${d.ipAddress}:${d.snmpPort}) ditambahkan.`)
  })

  return { ok: true as const, message: `${d.name} ditambahkan ke SQLite.`, id, state: readMonitoringState() }
}

export function updateOlt(id: string, input: OltMutationInput, actor: string) {
  const existing = db.prepare("SELECT * FROM olts WHERE id = ?").get(id) as OltRow | undefined
  if (!existing) return { ok: false as const, message: "OLT tidak ditemukan." }

  const existingRead = decryptSecret(existing.read_community)
  const checked = validateOltInput(input, !existingRead)
  if (!checked.ok) return { ok: false as const, message: checked.message }
  const d = checked.data

  const nextReadEncrypted = d.readCommunity ? encryptSecret(d.readCommunity) : encryptSecret(existingRead)
  const nextWriteEncrypted = d.clearWriteCommunity
    ? ""
    : d.writeCommunity
      ? encryptSecret(d.writeCommunity)
      : existing.write_community ?? ""

  runTransaction(() => {
    db.prepare(
      `UPDATE olts SET
        name = ?, ip_address = ?, vendor = ?, polling_interval = ?, snmp_port = ?,
        read_community = ?, write_community = ?, oid_profile = ?, write_mode = ?
      WHERE id = ?`,
    ).run(
      d.name,
      d.ipAddress,
      d.vendor,
      d.pollingInterval,
      d.snmpPort,
      nextReadEncrypted,
      nextWriteEncrypted,
      d.oidProfile,
      d.writeMode,
      id,
    )
    recordAuditLog(actor, "olt_update", `OLT ${d.name} (${d.ipAddress}:${d.snmpPort}) diperbarui.`)
  })

  return { ok: true as const, message: `${d.name} berhasil diperbarui.`, state: readMonitoringState() }
}

export function deleteOlt(id: string, actor: string) {
  const existing = db.prepare("SELECT id, name FROM olts WHERE id = ?").get(id) as { id: string; name: string } | undefined
  if (!existing) return { ok: false as const, message: "OLT tidak ditemukan." }

  runTransaction(() => {
    db.prepare("DELETE FROM alerts WHERE olt_id = ?").run(id)
    db.prepare("DELETE FROM onus WHERE olt_id = ?").run(id)
    db.prepare("DELETE FROM olts WHERE id = ?").run(id)
    recordAuditLog(actor, "olt_delete", `OLT ${existing.name} beserta ONU dan alert terkait dihapus.`)
  })

  return { ok: true as const, message: `${existing.name} beserta ONU & alert terkait dihapus.`, state: readMonitoringState() }
}

export function updateOltTestResult(id: string, ok: boolean, values?: Record<string, string>): MonitoringState {
  const existing = db.prepare("SELECT * FROM olts WHERE id = ?").get(id) as OltRow | undefined
  if (!existing) return readMonitoringState()

  let mergedInfo: string | null = existing.system_info
  if (values) mergedInfo = JSON.stringify(values)

  const nextModel = values?.["1.3.6.1.4.1.50224.3.1.1.19.0"] || values?.["1.3.6.1.4.1.37950.1.1.5.10.14.1.0"] || existing.model
  const nextLocation = values?.["1.3.6.1.2.1.1.6.0"] || existing.location
  const nextUptime = values?.["1.3.6.1.2.1.1.3.0"] ?? existing.uptime

  runTransaction(() => {
    db.prepare(
      `UPDATE olts SET status = ?, active_onu = ?, last_seen = ?, uptime = ?, model = ?, location = ?, system_info = ? WHERE id = ?`,
    ).run(
      ok ? "online" : "offline",
      ok ? existing.active_onu : 0,
      ok ? "Baru saja" : existing.last_seen,
      nextUptime,
      nextModel,
      nextLocation,
      mergedInfo,
      id,
    )
    if (!ok) {
      markOltOnusOffline(id)
    }
  })

  return readMonitoringState()
}

export function savePollResultForOlt(input: {
  oltId: string
  status: Olt["status"]
  activeOnu?: number
  lastSeen: string
  polledOnus?: Onu[]
  nextAlerts: Alert[]
}): MonitoringState {
  const insertOnu = db.prepare(`
    INSERT INTO onus (
      id, olt_id, name, serial_number, pon_port, onu_index, status,
      rx_power, tx_power, temperature_c, down_reason, distance_meters,
      last_seen, sync_status, latitude, longitude, location_note, location_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertAlert = db.prepare(`
    INSERT INTO alerts (id, olt_id, title, detail, severity, created_at, acknowledged, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  runTransaction(() => {
    const nextActiveOnu = input.status === "offline" ? 0 : input.activeOnu
    if (nextActiveOnu !== undefined) {
      db.prepare("UPDATE olts SET status = ?, active_onu = ?, last_seen = ? WHERE id = ?").run(
        input.status,
        nextActiveOnu,
        input.lastSeen,
        input.oltId,
      )
    } else {
      db.prepare("UPDATE olts SET status = ?, last_seen = ? WHERE id = ?").run(input.status, input.lastSeen, input.oltId)
    }

    if (input.polledOnus) {
      db.prepare("DELETE FROM onus WHERE olt_id = ?").run(input.oltId)
      for (const onu of input.polledOnus) {
        insertOnu.run(
          onu.id,
          input.oltId,
          onu.name,
          onu.serialNumber || "-",
          String(onu.ponPort ?? "-"),
          String(onu.onuIndex ?? "-"),
          onu.status || "offline",
          Number(onu.rxPower) || 0,
          Number(onu.txPower) || 0,
          onu.temperatureC ?? null,
          onu.downReason ?? null,
          Number(onu.distanceMeters) || 0,
          onu.lastSeen || "Baru saja",
          onu.syncStatus || "synced",
          typeof onu.latitude === "number" && Number.isFinite(onu.latitude) ? onu.latitude : null,
          typeof onu.longitude === "number" && Number.isFinite(onu.longitude) ? onu.longitude : null,
          onu.locationNote ? onu.locationNote.slice(0, 300) : null,
          onu.locationUpdatedAt ?? null,
        )
      }
    } else if (input.status === "offline") {
      markOltOnusOffline(input.oltId)
    }

    db.prepare("DELETE FROM alerts").run()
    const baseOrder = Date.now()
    input.nextAlerts.slice(0, 300).forEach((a, idx) => {
      insertAlert.run(a.id, a.oltId, a.title, a.detail, a.severity, a.createdAt, a.acknowledged ? 1 : 0, baseOrder - idx)
    })
  })

  return readMonitoringState()
}

export function applyOnuRenameLocal(onuId: string, nextName: string, syncedToDevice: boolean, actor: string): MonitoringState {
  const cleanName = nextName.trim().slice(0, 64)
  const syncStatus: Onu["syncStatus"] = syncedToDevice ? "synced" : "pending"
  runTransaction(() => {
    db.prepare("UPDATE onus SET name = ?, sync_status = ? WHERE id = ?").run(cleanName, syncStatus, onuId)
    recordAuditLog(actor, "onu_rename", `ONU ${onuId} diubah namanya menjadi "${cleanName}" (${syncStatus}).`)
  })
  return readMonitoringState()
}

export function clearAlertsByMode(mode: "acknowledged" | "all", actor: string): MonitoringState {
  runTransaction(() => {
    if (mode === "acknowledged") {
      db.prepare("DELETE FROM alerts WHERE acknowledged = 1").run()
      recordAuditLog(actor, "alerts_clear", "Membersihkan alert yang sudah selesai.")
    } else {
      db.prepare("DELETE FROM alerts").run()
      recordAuditLog(actor, "alerts_clear_all", "Mengosongkan seluruh riwayat alert.")
    }
  })
  return readMonitoringState()
}

export function resetMonitoringState(actor = "system"): MonitoringState {
  runTransaction(() => {
    db.prepare("DELETE FROM alerts").run()
    db.prepare("DELETE FROM onus").run()
    db.prepare("DELETE FROM olts").run()
    db.prepare(`INSERT INTO settings (key, value) VALUES ('map', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
      JSON.stringify(defaultMapSettings),
    )
    recordAuditLog(actor, "db_reset", "Seluruh data OLT, ONU, lokasi peta, dan alert direset ke kosong.")
  })
  return readMonitoringState()
}

export function updateOnuLocation(onuId: string, latitude: number, longitude: number, locationNote?: string) {
  const existing = db.prepare("SELECT id, name FROM onus WHERE id = ?").get(onuId) as { id: string; name: string } | undefined
  if (!existing) return { ok: false, message: "Perangkat ONU tidak ditemukan." }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { ok: false, message: "Latitude tidak valid (-90 s/d 90)." }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return { ok: false, message: "Longitude tidak valid (-180 s/d 180)." }
  const updatedAt = new Date().toLocaleString("id-ID")
  const cleanNote = locationNote?.trim() ? locationNote.trim().slice(0, 300) : null
  db.prepare(`UPDATE onus SET latitude = ?, longitude = ?, location_note = ?, location_updated_at = ? WHERE id = ?`).run(
    Number(latitude.toFixed(7)),
    Number(longitude.toFixed(7)),
    cleanNote,
    updatedAt,
    onuId,
  )
  return {
    ok: true,
    message: `Lokasi ONU ${existing.name} berhasil disimpan (${latitude.toFixed(6)}, ${longitude.toFixed(6)}).`,
    state: readMonitoringState(),
  }
}

export function clearOnuLocation(onuId: string) {
  const existing = db.prepare("SELECT id, name FROM onus WHERE id = ?").get(onuId) as { id: string; name: string } | undefined
  if (!existing) return { ok: false, message: "Perangkat ONU tidak ditemukan." }
  db.prepare(`UPDATE onus SET latitude = NULL, longitude = NULL, location_note = NULL, location_updated_at = NULL WHERE id = ?`).run(onuId)
  return { ok: true, message: `Titik lokasi ONU ${existing.name} berhasil dihapus.`, state: readMonitoringState() }
}

export function bulkUpdateOnuLocations(
  oltId: string,
  items: BulkOnuLocationItem[],
  actor = "system",
): BulkOnuLocationResult {
  if (items.length > MAX_BULK_ITEMS) {
    return {
      ok: false,
      message: `Maksimal ${MAX_BULK_ITEMS} baris per proses import.`,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: items.length,
    }
  }

  const olt = db.prepare("SELECT id, name FROM olts WHERE id = ?").get(oltId) as { id: string; name: string } | undefined
  if (!olt) {
    return { ok: false, message: "OLT tidak ditemukan.", updatedCount: 0, skippedCount: 0, failedCount: items.length }
  }

  const rows = db
    .prepare("SELECT id, name, serial_number, location_note FROM onus WHERE olt_id = ?")
    .all(oltId) as { id: string; name: string; serial_number: string; location_note: string | null }[]

  const byId = new Map<string, (typeof rows)[number]>()
  const bySn = new Map<string, (typeof rows)[number]>()
  const byName = new Map<string, (typeof rows)[number]>()

  for (const r of rows) {
    byId.set(r.id, r)
    const sn = r.serial_number?.trim().toUpperCase()
    if (sn && sn !== "-") bySn.set(sn, r)
    const nm = r.name?.trim().toLowerCase()
    if (nm) byName.set(nm, r)
  }

  let updatedCount = 0
  let failedCount = 0
  const errors: string[] = []
  const updatedAt = new Date().toLocaleString("id-ID")
  const stmt = db.prepare(`UPDATE onus SET latitude = ?, longitude = ?, location_note = ?, location_updated_at = ? WHERE id = ?`)

  runTransaction(() => {
    items.forEach((item, idx) => {
      const snKey = item.serialNumber?.trim().toUpperCase()
      const nameKey = item.name?.trim().toLowerCase()
      const target =
        (item.onuId ? byId.get(item.onuId) : undefined) ??
        (snKey && snKey !== "-" ? bySn.get(snKey) : undefined) ??
        (nameKey ? byName.get(nameKey) : undefined)

      if (!target) {
        failedCount += 1
        if (errors.length < 20) errors.push(`Item #${idx + 1} (${item.name || item.serialNumber || "-"}): ONU tidak ditemukan pada OLT ${olt.name}.`)
        return
      }

      const lat = Number(item.latitude)
      const lng = Number(item.longitude)
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        failedCount += 1
        if (errors.length < 20) errors.push(`Item #${idx + 1} (${target.name}): Koordinat tidak valid (${item.latitude}, ${item.longitude}).`)
        return
      }

      const nextNote =
        item.locationNote !== undefined
          ? item.locationNote.trim()
            ? item.locationNote.trim().slice(0, 300)
            : null
          : target.location_note

      stmt.run(Number(lat.toFixed(7)), Number(lng.toFixed(7)), nextNote, updatedAt, target.id)
      updatedCount += 1
    })

    if (updatedCount > 0) {
      recordAuditLog(actor, "onu_location_bulk", `Import massal ${updatedCount} titik koordinat ONU pada OLT ${olt.name}.`)
    }
  })

  if (updatedCount === 0) {
    return {
      ok: false,
      message: errors[0] || "Tidak ada koordinat valid yang berhasil disimpan.",
      updatedCount: 0,
      skippedCount: 0,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  return {
    ok: true,
    message: `${updatedCount} titik lokasi ONU pada ${olt.name} berhasil disimpan${failedCount > 0 ? ` (${failedCount} gagal)` : ""}.`,
    updatedCount,
    skippedCount: 0,
    failedCount,
    errors: errors.length > 0 ? errors : undefined,
    state: readMonitoringState(),
  }
}
