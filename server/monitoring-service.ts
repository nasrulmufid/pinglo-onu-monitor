import type { Alert, BulkOnuLocationItem, BulkOnuLocationResult, MapSettings, MonitoringState, Olt, Onu } from "../shared/types"
import { db, defaultMapSettings, runTransaction } from "./db"

type OltRow = {
  id: string; name: string; ip_address: string; vendor: Olt["vendor"]; model: string; location: string;
  status: Olt["status"]; uptime: string; cpu_load: number; memory_load: number; pon_ports: number;
  active_onu: number; polling_interval: number; snmp_version: Olt["snmpVersion"]; snmp_port: number;
  read_community: string; write_community: string | null; oid_profile: Olt["oidProfile"];
  write_mode: Olt["writeMode"]; last_seen: string; system_info: string | null;
}

type OnuRow = {
  id: string; olt_id: string; name: string; serial_number: string; pon_port: string; onu_index: string;
  status: Onu["status"]; rx_power: number; tx_power: number; temperature_c: number | null;
  down_reason: string | null; distance_meters: number; last_seen: string; sync_status: Onu["syncStatus"];
  latitude: number | null; longitude: number | null; location_note: string | null; location_updated_at: string | null;
}

type AlertRow = {
  id: string; olt_id: string; title: string; detail: string; severity: Alert["severity"];
  created_at: string; acknowledged: number;
}

function rowToOlt(r: OltRow): Olt {
  let systemInfo: Record<string, string> | undefined
  if (r.system_info) { try { systemInfo = JSON.parse(r.system_info) as Record<string, string> } catch { systemInfo = undefined } }
  return {
    id: r.id, name: r.name, ipAddress: r.ip_address, vendor: r.vendor, model: r.model, location: r.location,
    status: r.status, uptime: r.uptime, cpuLoad: r.cpu_load, memoryLoad: r.memory_load, ponPorts: r.pon_ports,
    activeOnu: r.active_onu, pollingInterval: r.polling_interval, snmpVersion: r.snmp_version, snmpPort: r.snmp_port,
    readCommunity: r.read_community, writeCommunity: r.write_community ?? "", oidProfile: r.oid_profile,
    writeMode: r.write_mode, lastSeen: r.last_seen, systemInfo,
  }
}

function rowToOnu(r: OnuRow): Onu {
  return {
    id: r.id, oltId: r.olt_id, name: r.name, serialNumber: r.serial_number, ponPort: r.pon_port, onuIndex: r.onu_index,
    status: r.status, rxPower: r.rx_power, txPower: r.tx_power, temperatureC: r.temperature_c, downReason: r.down_reason,
    distanceMeters: r.distance_meters, lastSeen: r.last_seen, syncStatus: r.sync_status,
    latitude: r.latitude, longitude: r.longitude, locationNote: r.location_note, locationUpdatedAt: r.location_updated_at,
  }
}

function rowToAlert(r: AlertRow): Alert {
  return { id: r.id, oltId: r.olt_id, title: r.title, detail: r.detail, severity: r.severity, createdAt: r.created_at, acknowledged: Boolean(r.acknowledged) }
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
  } catch { return { ...defaultMapSettings } }
}

export function saveMapSettings(next: MapSettings): MapSettings {
  const norm: MapSettings = {
    defaultLat: Math.max(-90, Math.min(90, Number(next.defaultLat) || defaultMapSettings.defaultLat)),
    defaultLng: Math.max(-180, Math.min(180, Number(next.defaultLng) || defaultMapSettings.defaultLng)),
    defaultZoom: Math.max(2, Math.min(20, Math.round(Number(next.defaultZoom) || defaultMapSettings.defaultZoom))),
  }
  db.prepare(`INSERT INTO settings (key, value) VALUES ('map', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(norm))
  return norm
}

export const emptyMonitoringState: MonitoringState = { olts: [], onus: [], alerts: [], settings: { map: { ...defaultMapSettings } } }

export function readMonitoringState(): MonitoringState {
  const olts = (db.prepare("SELECT * FROM olts ORDER BY rowid ASC").all() as OltRow[]).map(rowToOlt)
  const onus = (db.prepare("SELECT * FROM onus ORDER BY CAST(pon_port AS INTEGER) ASC, CAST(onu_index AS INTEGER) ASC").all() as OnuRow[]).map(rowToOnu)
  const alerts = (db.prepare("SELECT * FROM alerts ORDER BY sort_order DESC LIMIT 300").all() as AlertRow[]).map(rowToAlert)
  return { olts, onus, alerts, settings: { map: getMapSettings() } }
}

export function writeMonitoringState(state: MonitoringState): MonitoringState {
  const insertOlt = db.prepare(`
    INSERT INTO olts (
      id, name, ip_address, vendor, model, location, status, uptime,
      cpu_load, memory_load, pon_ports, active_onu, polling_interval,
      snmp_version, snmp_port, read_community, write_community,
      oid_profile, write_mode, last_seen, system_info
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
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
    db.prepare("DELETE FROM alerts").run()
    db.prepare("DELETE FROM onus").run()
    db.prepare("DELETE FROM olts").run()

    const validOltIds = new Set<string>()
    for (const olt of state.olts ?? []) {
      validOltIds.add(olt.id)
      insertOlt.run(
        olt.id, olt.name, olt.ipAddress, olt.vendor, olt.model || "-", olt.location || "-",
        olt.status || "offline", olt.uptime || "-", Number(olt.cpuLoad) || 0, Number(olt.memoryLoad) || 0,
        Number(olt.ponPorts) || 0, Number(olt.activeOnu) || 0, Number(olt.pollingInterval) || 60,
        olt.snmpVersion || "v2c", Number(olt.snmpPort) || 161, olt.readCommunity, olt.writeCommunity ?? "",
        olt.oidProfile || "generic", olt.writeMode || "none", olt.lastSeen || "Belum pernah dipolling",
        olt.systemInfo ? JSON.stringify(olt.systemInfo) : null,
      )
    }

    for (const onu of state.onus ?? []) {
      if (!validOltIds.has(onu.oltId)) continue
      insertOnu.run(
        onu.id, onu.oltId, onu.name, onu.serialNumber || "-", String(onu.ponPort ?? "-"),
        String(onu.onuIndex ?? "-"), onu.status || "offline", Number(onu.rxPower) || 0,
        Number(onu.txPower) || 0, onu.temperatureC ?? null, onu.downReason ?? null,
        Number(onu.distanceMeters) || 0, onu.lastSeen || "Baru saja", onu.syncStatus || "synced",
        typeof onu.latitude === "number" && Number.isFinite(onu.latitude) ? onu.latitude : null,
        typeof onu.longitude === "number" && Number.isFinite(onu.longitude) ? onu.longitude : null,
        onu.locationNote ?? null, onu.locationUpdatedAt ?? null,
      )
    }

    const alerts = (state.alerts ?? []).slice(0, 300)
    const baseOrder = Date.now()
    alerts.forEach((a, idx) => {
      insertAlert.run(a.id, a.oltId, a.title, a.detail, a.severity, a.createdAt, a.acknowledged ? 1 : 0, baseOrder - idx)
    })

    if (state.settings?.map) saveMapSettings(state.settings.map)
  })

  return readMonitoringState()
}

export function resetMonitoringState(): MonitoringState { return writeMonitoringState(emptyMonitoringState) }

export function updateOnuLocation(onuId: string, latitude: number, longitude: number, locationNote?: string) {
  const existing = db.prepare("SELECT id, name FROM onus WHERE id = ?").get(onuId) as { id: string; name: string } | undefined
  if (!existing) return { ok: false, message: "Perangkat ONU tidak ditemukan." }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return { ok: false, message: "Latitude tidak valid (-90 s/d 90)." }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return { ok: false, message: "Longitude tidak valid (-180 s/d 180)." }
  const updatedAt = new Date().toLocaleString("id-ID")
  const cleanNote = locationNote?.trim() ? locationNote.trim() : null
  db.prepare(`UPDATE onus SET latitude = ?, longitude = ?, location_note = ?, location_updated_at = ? WHERE id = ?`)
    .run(Number(latitude.toFixed(7)), Number(longitude.toFixed(7)), cleanNote, updatedAt, onuId)
  return { ok: true, message: `Lokasi ONU ${existing.name} berhasil disimpan (${latitude.toFixed(6)}, ${longitude.toFixed(6)}).`, state: readMonitoringState() }
}

export function clearOnuLocation(onuId: string) {
  const existing = db.prepare("SELECT id, name FROM onus WHERE id = ?").get(onuId) as { id: string; name: string } | undefined
  if (!existing) return { ok: false, message: "Perangkat ONU tidak ditemukan." }
  db.prepare(`UPDATE onus SET latitude = NULL, longitude = NULL, location_note = NULL, location_updated_at = NULL WHERE id = ?`).run(onuId)
  return { ok: true, message: `Titik lokasi ONU ${existing.name} berhasil dihapus.`, state: readMonitoringState() }
}

export function bulkUpdateOnuLocations(oltId: string, items: BulkOnuLocationItem[]): BulkOnuLocationResult {
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
            ? item.locationNote.trim()
            : null
          : target.location_note

      stmt.run(Number(lat.toFixed(7)), Number(lng.toFixed(7)), nextNote, updatedAt, target.id)
      updatedCount += 1
    })
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
