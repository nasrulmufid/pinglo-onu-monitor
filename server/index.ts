import cors from "cors"
import express from "express"
import { existsSync } from "node:fs"
import path from "node:path"

import type { AppRole } from "../shared/auth-types"
import type { Alert, BulkOnuLocationItem, MapSettings, MonitoringState, Olt, Onu } from "../shared/types"
import { authenticateUser, createUser, deleteUser, listAuthData, updateUser } from "./auth-service"
import {
  bulkUpdateOnuLocations, clearOnuLocation, readMonitoringState, resetMonitoringState,
  saveMapSettings, updateOnuLocation, writeMonitoringState,
} from "./monitoring-service"
import { pollOnusFromOlt, renameOnuOnDevice, testOnuRenameWrite, testSnmpConnection } from "./snmp"
import { getStartupStatus } from "./startup-service"

const app = express()
const port = Number(process.env.PORT || 3007)
const host = process.env.HOST || "0.0.0.0"

app.use(cors())
app.use(express.json({ limit: "10mb" }))

const activePolls = new Set<string>()

function formatRxPower(v: number) { return !Number.isFinite(v) || v === 0 ? "-" : `${v} dBm` }
function formatTemp(v: number | null | undefined) { return v === null || v === undefined || !Number.isFinite(v) ? "-" : `${v} C` }

function buildOnuAlertDetail(onu: Onu, olt: Olt, eventTime: string, eventLabel: string) {
  return [
    `Nama pelanggan: ${onu.name}`, `OLT: ${olt.name}`, `PON: ${onu.ponPort}:${onu.onuIndex}`,
    `Serial: ${onu.serialNumber || "-"}`, `Status: ${onu.status}`, `RX: ${formatRxPower(onu.rxPower)}`,
    `Suhu: ${formatTemp(onu.temperatureC)}`, `Kasus Down: ${onu.status === "online" ? "-" : onu.downReason || "Down"}`,
    `Last Seen: ${onu.lastSeen}`, `Event: ${eventLabel}`, `Waktu Event: ${eventTime}`,
  ].join(" | ")
}

function latestSavedEvent(state: MonitoringState, prefix: string) {
  const latest = state.alerts.find((a) => a.id.startsWith(`${prefix}-down-`) || a.id.startsWith(`${prefix}-recovery-`))
  if (!latest) return null
  return latest.id.startsWith(`${prefix}-down-`) ? "down" : "recovery"
}

function buildOltTransitionAlert(state: MonitoringState, olt: Olt, status: "down" | "recovery", errorMessage?: string) {
  if (latestSavedEvent(state, `olt-${olt.id}`) === status) return null
  const eventTime = new Date().toLocaleString("id-ID")
  const detail = [
    `Nama OLT: ${olt.name}`, `IP: ${olt.ipAddress}:${olt.snmpPort || 161}`, `Vendor: ${olt.vendor}`,
    `Tipe: ${olt.model || "-"}`, `Lokasi: ${olt.location || "-"}`,
    `Event: ${status === "down" ? "Down terdeteksi" : "Recovery terdeteksi"}`,
    errorMessage ? `Error: ${errorMessage}` : null, `Waktu Event: ${eventTime}`,
  ].filter(Boolean).join(" | ")

  return {
    id: `olt-${olt.id}-${status}-${Date.now()}`, oltId: olt.id,
    title: status === "down" ? `OLT down: ${olt.name}` : `OLT recovery: ${olt.name}`,
    detail, severity: status === "down" ? ("critical" as const) : ("info" as const),
    createdAt: eventTime, acknowledged: status === "recovery",
  }
}

function buildTransitionAlerts(state: MonitoringState, olt: Olt, nextOnus: Onu[]) {
  const previousById = new Map(state.onus.filter((o) => o.oltId === olt.id).map((o) => [o.id, o]))
  const eventTime = new Date().toLocaleString("id-ID")
  const alerts: Alert[] = []
  const recoveredOnuIds: string[] = []

  for (const onu of nextOnus) {
    const prev = previousById.get(onu.id)
    if (!prev) continue
    const wasOnline = prev.status === "online"
    const isOnline = onu.status === "online"

    if (wasOnline && !isOnline) {
      if (latestSavedEvent(state, `onu-${onu.id}`) === "down") continue
      alerts.push({
        id: `onu-${onu.id}-down-${Date.now()}`, oltId: olt.id,
        title: `ONT down: ${onu.name}`, detail: buildOnuAlertDetail(onu, olt, eventTime, "Down terdeteksi"),
        severity: "critical", createdAt: eventTime, acknowledged: false,
      })
    } else if (!wasOnline && isOnline) {
      if (latestSavedEvent(state, `onu-${onu.id}`) === "recovery") continue
      recoveredOnuIds.push(onu.id)
      alerts.push({
        id: `onu-${onu.id}-recovery-${Date.now()}`, oltId: olt.id,
        title: `ONT recovery: ${onu.name}`, detail: buildOnuAlertDetail(onu, olt, eventTime, "Recovery terdeteksi"),
        severity: "info", createdAt: eventTime, acknowledged: true,
      })
    }
  }
  return { alerts, recoveredOnuIds }
}

function preserveLocalOnuMetadata(state: MonitoringState, olt: Olt, nextOnus: Onu[]): Onu[] {
  const existing = state.onus.filter((o) => o.oltId === olt.id)
  const prevById = new Map(existing.map((o) => [o.id, o]))
  const prevBySn = new Map(existing.filter((o) => o.serialNumber && o.serialNumber !== "-").map((o) => [o.serialNumber.toUpperCase(), o]))

  return nextOnus.map((onu) => {
    const prev = prevById.get(onu.id) ?? (onu.serialNumber && onu.serialNumber !== "-" ? prevBySn.get(onu.serialNumber.toUpperCase()) : undefined)
    const keepVsol = olt.oidProfile === "vsol-gpon" && prev && prev.name && prev.name !== onu.name && (prev.syncStatus === "pending" || prev.syncStatus === "local-only")
    return {
      ...onu,
      name: keepVsol ? prev.name : onu.name,
      syncStatus: keepVsol ? prev.syncStatus : onu.syncStatus,
      latitude: prev?.latitude ?? onu.latitude ?? null,
      longitude: prev?.longitude ?? onu.longitude ?? null,
      locationNote: prev?.locationNote ?? onu.locationNote ?? null,
      locationUpdatedAt: prev?.locationUpdatedAt ?? onu.locationUpdatedAt ?? null,
    }
  })
}

app.post("/api/auth/login", (req, res) => {
  const { username = "", password = "" } = (req.body ?? {}) as { username?: string; password?: string }
  const session = authenticateUser(username, password)
  if (!session) { res.status(401).json({ ok: false, message: "Username atau password salah." }); return }
  res.json({ ok: true, message: "Login berhasil.", session })
})
app.get("/api/auth/users", (_req, res) => res.json(listAuthData()))
app.post("/api/auth/users", (req, res) => {
  const r = createUser(req.body as { username: string; name: string; password: string; role: AppRole; actor: string })
  res.status(r.ok ? 200 : 400).json(r)
})
app.put("/api/auth/users", (req, res) => {
  const r = updateUser(req.body as { id: string; username: string; name: string; role: AppRole; password?: string; actor: string })
  res.status(r.ok ? 200 : 400).json(r)
})
app.delete("/api/auth/users", (req, res) => {
  const r = deleteUser(req.body as { id: string; actor: string })
  res.status(r.ok ? 200 : 400).json(r)
})

app.get("/api/monitoring/state", (_req, res) => res.json(readMonitoringState()))
app.put("/api/monitoring/state", (req, res) => {
  try { res.json(writeMonitoringState(req.body as MonitoringState)) }
  catch (e) { res.status(400).json({ ok: false, message: e instanceof Error ? e.message : "Database gagal disimpan." }) }
})
app.delete("/api/monitoring/state", (_req, res) => res.json(resetMonitoringState()))

app.put("/api/settings/map", (req, res) => {
  const map = saveMapSettings((req.body ?? {}) as MapSettings)
  res.json({ ok: true, message: "Pengaturan default peta tersimpan.", map, state: readMonitoringState() })
})
app.put("/api/onu/:id/location", (req, res) => {
  const { latitude, longitude, locationNote } = (req.body ?? {}) as { latitude?: number; longitude?: number; locationNote?: string }
  const r = updateOnuLocation(req.params.id, Number(latitude), Number(longitude), locationNote)
  res.status(r.ok ? 200 : 400).json(r)
})
app.delete("/api/onu/:id/location", (req, res) => {
  const r = clearOnuLocation(req.params.id)
  res.status(r.ok ? 200 : 400).json(r)
})
app.put("/api/onus/locations/bulk", (req, res) => {
  const { oltId = "", items = [] } = (req.body ?? {}) as { oltId?: string; items?: BulkOnuLocationItem[] }
  if (!oltId || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ ok: false, message: "OLT dan daftar koordinat wajib diisi.", updatedCount: 0, skippedCount: 0, failedCount: 0 })
    return
  }
  const r = bulkUpdateOnuLocations(oltId, items)
  res.status(r.ok ? 200 : 400).json(r)
})

app.post("/api/onu/rename", async (req, res) => {
  try {
    const r = await renameOnuOnDevice(req.body)
    res.status(r.ok ? 200 : 400).json(r)
  } catch (e) {
    res.status(400).json({ ok: false, syncedToDevice: false, message: e instanceof Error ? e.message : "Rename gagal." })
  }
})

app.post("/api/snmp/test", async (req, res) => res.json(await testSnmpConnection(req.body)))
app.post("/api/snmp/test-write", async (req, res) => {
  const r = await testOnuRenameWrite(req.body)
  res.status(r.ok ? 200 : 400).json(r)
})
app.post("/api/snmp/poll-onu", async (req, res) => {
  const requestedOlt = req.body as Olt
  const lockKey = requestedOlt.id || `${requestedOlt.ipAddress}:${requestedOlt.snmpPort || 161}`
  if (activePolls.has(lockKey)) {
    res.status(409).json({ ok: false, message: `Polling ${requestedOlt.name || requestedOlt.ipAddress} masih berjalan.`, onus: [] })
    return
  }
  activePolls.add(lockKey)
  try {
    const initialState = readMonitoringState()
    const savedOlt = initialState.olts.find((i) => i.id === requestedOlt.id)
    if (requestedOlt.id && !savedOlt) {
      res.status(200).json({ ok: false, message: "OLT sudah tidak ada di database.", onus: [] })
      return
    }
    const pollingOlt = savedOlt ?? requestedOlt
    const result = await pollOnusFromOlt(pollingOlt)
    const state = readMonitoringState()
    const olt = state.olts.find((i) => i.id === pollingOlt.id)
    if (!olt) {
      res.status(200).json({ ...result, ok: false, message: "OLT sudah dihapus.", onus: [], state })
      return
    }

    if (result.ok) {
      const oltWasOffline = olt.status === "offline"
      const polledOnus = preserveLocalOnuMetadata(state, olt, result.onus ?? [])
      const transition = buildTransitionAlerts(state, olt, polledOnus)
      const oltRec = oltWasOffline ? buildOltTransitionAlert(state, olt, "recovery") : null
      const acked = state.alerts.map((a) =>
        transition.recoveredOnuIds.some((id) => a.id.startsWith(`onu-${id}-down-`)) || (oltWasOffline && a.id.startsWith(`olt-${olt.id}-down-`))
          ? { ...a, acknowledged: true }
          : a,
      )
      const nextState: MonitoringState = {
        ...state,
        onus: [...state.onus.filter((o) => o.oltId !== olt.id), ...polledOnus],
        alerts: [...(oltRec ? [oltRec] : []), ...transition.alerts, ...acked].slice(0, 300),
        olts: state.olts.map((i) =>
          i.id === olt.id ? { ...i, status: "online" as const, activeOnu: polledOnus.filter((o) => o.status === "online").length, lastSeen: "Baru saja" } : i,
        ),
      }
      res.json({ ...result, onus: polledOnus, state: writeMonitoringState(nextState) })
      return
    }

    const oltDown = buildOltTransitionAlert(state, olt, "down", result.message)
    const nextState: MonitoringState = {
      ...state,
      alerts: [...(oltDown ? [oltDown] : []), ...state.alerts].slice(0, 300),
      olts: state.olts.map((i) => (i.id === olt.id ? { ...i, status: "offline" as const, lastSeen: `Gagal: ${new Date().toLocaleString("id-ID")}` } : i)),
    }
    res.status(200).json({ ...result, state: writeMonitoringState(nextState) })
  } finally {
    activePolls.delete(lockKey)
  }
})

app.get("/api/system/startup", (_req, res) => res.json(getStartupStatus()))

const distDir = path.join(process.cwd(), "dist")
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")))
}

app.listen(port, host, () => {
  console.log(`[PingLo] Server running at http://127.0.0.1:${port}`)
})
