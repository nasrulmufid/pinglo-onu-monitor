import express, { type NextFunction, type Request, type Response } from "express"
import { existsSync } from "node:fs"
import path from "node:path"

import { sessionDurationMs, type AppRole } from "../shared/auth-types"
import type { Alert, BulkOnuLocationItem, MapSettings, MonitoringState, Olt, Onu } from "../shared/types"
import {
  authenticateUser,
  changeOwnPassword,
  createUser,
  deleteUser,
  listAuthData,
  revokeSession,
  updateUser,
} from "./auth-service"
import { recordAuditLog } from "./db"
import {
  applyOnuRenameLocal,
  bulkUpdateOnuLocations,
  clearAlertsByMode,
  clearOnuLocation,
  createOlt,
  deleteOlt,
  getOltWithSecrets,
  readMonitoringState,
  resetMonitoringState,
  saveMapSettings,
  savePollResultForOlt,
  updateOlt,
  updateOltTestResult,
  updateOnuLocation,
  type OltMutationInput,
} from "./monitoring-service"
import {
  clearSessionCookie,
  corsMiddleware,
  createRateLimiter,
  csrfProtectionMiddleware,
  getClientIp,
  requireAuth,
  requireRole,
  securityHeadersMiddleware,
  setSessionCookie,
} from "./security-middleware"
import { pollOnusFromOlt, renameOnuOnDevice, testOnuRenameWrite, testSnmpConnection, validateSnmpTargetHost } from "./snmp"
import { getStartupStatus } from "./startup-service"

const app = express()
const port = Number(process.env.PORT || 3007)
const host = process.env.HOST || "0.0.0.0"

app.disable("x-powered-by")
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false)

app.use(securityHeadersMiddleware)
app.use(corsMiddleware)
app.use(csrfProtectionMiddleware)

const bulkJsonParser = express.json({ limit: "2mb" })
const defaultJsonParser = express.json({ limit: "256kb" })
app.use((req, res, next) => {
  if (req.path === "/api/onus/locations/bulk") {
    bulkJsonParser(req, res, next)
  } else {
    defaultJsonParser(req, res, next)
  }
})

const loginIpLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: (req) => getClientIp(req),
  message: "Terlalu banyak percobaan login dari alamat IP ini. Silakan coba lagi nanti.",
})

const loginUserLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => {
    const user = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase().slice(0, 32) : "-"
    return `${getClientIp(req)}:${user}`
  },
  message: "Terlalu banyak percobaan login gagal untuk akun ini. Silakan tunggu beberapa menit.",
})

const snmpLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyFn: (req) => req.authUser?.id || getClientIp(req),
  message: "Batas permintaan SNMP per menit tercapai. Tunggu sebentar sebelum mencoba lagi.",
})

const activePolls = new Set<string>()

function formatRxPower(v: number) {
  return !Number.isFinite(v) || v === 0 ? "-" : `${v} dBm`
}
function formatTemp(v: number | null | undefined) {
  return v === null || v === undefined || !Number.isFinite(v) ? "-" : `${v} C`
}

function buildOnuAlertDetail(onu: Onu, olt: Olt, eventTime: string, eventLabel: string) {
  return [
    `Nama pelanggan: ${onu.name}`,
    `OLT: ${olt.name}`,
    `PON: ${onu.ponPort}:${onu.onuIndex}`,
    `Serial: ${onu.serialNumber || "-"}`,
    `Status: ${onu.status}`,
    `RX: ${formatRxPower(onu.rxPower)}`,
    `Suhu: ${formatTemp(onu.temperatureC)}`,
    `Kasus Down: ${onu.status === "online" ? "-" : onu.downReason || "Down"}`,
    `Last Seen: ${onu.lastSeen}`,
    `Event: ${eventLabel}`,
    `Waktu Event: ${eventTime}`,
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
    `Nama OLT: ${olt.name}`,
    `IP: ${olt.ipAddress}:${olt.snmpPort || 161}`,
    `Vendor: ${olt.vendor}`,
    `Tipe: ${olt.model || "-"}`,
    `Lokasi: ${olt.location || "-"}`,
    `Event: ${status === "down" ? "Down terdeteksi" : "Recovery terdeteksi"}`,
    errorMessage ? `Error: ${errorMessage}` : null,
    `Waktu Event: ${eventTime}`,
  ]
    .filter(Boolean)
    .join(" | ")

  return {
    id: `olt-${olt.id}-${status}-${Date.now()}`,
    oltId: olt.id,
    title: status === "down" ? `OLT down: ${olt.name}` : `OLT recovery: ${olt.name}`,
    detail,
    severity: status === "down" ? ("critical" as const) : ("info" as const),
    createdAt: eventTime,
    acknowledged: status === "recovery",
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
    const wasMarkedOfflineByOlt = !wasOnline && prev.downReason === "OLT offline"
    const isOnline = onu.status === "online"

    if ((wasOnline || wasMarkedOfflineByOlt) && !isOnline) {
      if (latestSavedEvent(state, `onu-${onu.id}`) === "down") continue
      alerts.push({
        id: `onu-${onu.id}-down-${Date.now()}`,
        oltId: olt.id,
        title: `ONT down: ${onu.name}`,
        detail: buildOnuAlertDetail(onu, olt, eventTime, "Down terdeteksi"),
        severity: "critical",
        createdAt: eventTime,
        acknowledged: false,
      })
    } else if (!wasOnline && isOnline) {
      if (wasMarkedOfflineByOlt && latestSavedEvent(state, `onu-${onu.id}`) !== "down") continue
      if (latestSavedEvent(state, `onu-${onu.id}`) === "recovery") continue
      recoveredOnuIds.push(onu.id)
      alerts.push({
        id: `onu-${onu.id}-recovery-${Date.now()}`,
        oltId: olt.id,
        title: `ONT recovery: ${onu.name}`,
        detail: buildOnuAlertDetail(onu, olt, eventTime, "Recovery terdeteksi"),
        severity: "info",
        createdAt: eventTime,
        acknowledged: true,
      })
    }
  }
  return { alerts, recoveredOnuIds }
}

function preserveLocalOnuMetadata(state: MonitoringState, olt: Olt, nextOnus: Onu[]): Onu[] {
  const existing = state.onus.filter((o) => o.oltId === olt.id)
  const prevById = new Map(existing.map((o) => [o.id, o]))
  const prevBySn = new Map(
    existing
      .filter((o) => o.serialNumber && o.serialNumber !== "-")
      .map((o) => [o.serialNumber.toUpperCase(), o]),
  )

  return nextOnus.map((onu) => {
    const prev =
      prevById.get(onu.id) ??
      (onu.serialNumber && onu.serialNumber !== "-" ? prevBySn.get(onu.serialNumber.toUpperCase()) : undefined)
    const keepVsol =
      olt.oidProfile === "vsol-gpon" &&
      prev &&
      prev.name &&
      prev.name !== onu.name &&
      (prev.syncStatus === "pending" || prev.syncStatus === "local-only")
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

app.get("/api/health", (_req, res) => res.json({ ok: true }))

app.post("/api/auth/login", loginIpLimiter, loginUserLimiter, (req, res) => {
  const { username = "", password = "" } = (req.body ?? {}) as { username?: unknown; password?: unknown }
  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    res.status(400).json({ ok: false, message: "Username dan password wajib diisi." })
    return
  }
  const auth = authenticateUser(username, password, {
    ip: getClientIp(req),
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "-",
  })
  if (!auth) {
    res.status(401).json({ ok: false, message: "Username atau password salah." })
    return
  }
  setSessionCookie(req, res, auth.token, sessionDurationMs)
  res.json({ ok: true, message: "Login berhasil.", session: auth.session })
})

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, session: req.authUser })
})

app.post("/api/auth/logout", requireAuth, (req, res) => {
  revokeSession(req.sessionToken)
  clearSessionCookie(req, res)
  recordAuditLog(req.authUser!.username, "logout", `Logout dari IP ${getClientIp(req)}.`)
  res.json({ ok: true, message: "Logout berhasil." })
})

app.post("/api/auth/change-password", requireAuth, (req, res) => {
  const { currentPassword = "", newPassword = "" } = (req.body ?? {}) as {
    currentPassword?: unknown
    newPassword?: unknown
  }
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ ok: false, message: "Format password tidak valid." })
    return
  }
  const result = changeOwnPassword({
    userId: req.authUser!.id,
    currentPassword,
    newPassword,
    currentToken: req.sessionToken,
    ip: getClientIp(req),
  })
  res.status(result.ok ? 200 : 400).json(result)
})

app.get("/api/auth/users", requireAuth, requireRole("super-admin"), (_req, res) => res.json(listAuthData()))
app.post("/api/auth/users", requireAuth, requireRole("super-admin"), (req, res) => {
  const body = (req.body ?? {}) as { username?: string; name?: string; password?: string; role?: AppRole }
  const r = createUser({
    username: body.username ?? "",
    name: body.name ?? "",
    password: body.password ?? "",
    role: body.role ?? "admin",
    actor: req.authUser!.username,
  })
  res.status(r.ok ? 200 : 400).json(r)
})
app.put("/api/auth/users", requireAuth, requireRole("super-admin"), (req, res) => {
  const body = (req.body ?? {}) as { id?: string; username?: string; name?: string; role?: AppRole; password?: string }
  const r = updateUser({
    id: body.id ?? "",
    username: body.username ?? "",
    name: body.name ?? "",
    role: body.role ?? "admin",
    password: body.password,
    actor: req.authUser!.username,
  })
  res.status(r.ok ? 200 : 400).json(r)
})
app.delete("/api/auth/users", requireAuth, requireRole("super-admin"), (req, res) => {
  const body = (req.body ?? {}) as { id?: string }
  const r = deleteUser({
    id: body.id ?? "",
    actor: req.authUser!.username,
    actorUserId: req.authUser!.id,
  })
  res.status(r.ok ? 200 : 400).json(r)
})

app.get("/api/monitoring/state", requireAuth, (_req, res) => res.json(readMonitoringState()))
app.delete("/api/monitoring/state", requireAuth, requireRole("super-admin"), (req, res) => {
  res.json(resetMonitoringState(req.authUser!.username))
})

app.post("/api/olts", requireAuth, requireRole("super-admin"), async (req, res) => {
  const body = (req.body ?? {}) as OltMutationInput
  const validated = await validateSnmpTargetHost(body.ipAddress ?? "", Number(body.snmpPort ?? 161))
  if (!validated.ok) {
    res.status(400).json({ ok: false, message: validated.message })
    return
  }
  const r = createOlt({ ...body, ipAddress: validated.host, snmpPort: validated.port }, req.authUser!.username)
  res.status(r.ok ? 200 : 400).json(r)
})

function paramId(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] ?? "" : v ?? ""
}

app.put("/api/olts/:id", requireAuth, requireRole("super-admin"), async (req, res) => {
  const body = (req.body ?? {}) as OltMutationInput
  const validated = await validateSnmpTargetHost(body.ipAddress ?? "", Number(body.snmpPort ?? 161))
  if (!validated.ok) {
    res.status(400).json({ ok: false, message: validated.message })
    return
  }
  const r = updateOlt(paramId(req.params.id), { ...body, ipAddress: validated.host, snmpPort: validated.port }, req.authUser!.username)
  res.status(r.ok ? 200 : 400).json(r)
})

app.delete("/api/olts/:id", requireAuth, requireRole("super-admin"), (req, res) => {
  const r = deleteOlt(paramId(req.params.id), req.authUser!.username)
  res.status(r.ok ? 200 : 404).json(r)
})

app.delete("/api/alerts", requireAuth, (req, res) => {
  const requestedMode = req.query.mode ?? (req.body as { mode?: string } | undefined)?.mode
  const mode = requestedMode === "all" ? "all" : "acknowledged"
  if (mode === "all" && req.authUser!.role !== "super-admin") {
    res.status(403).json({ ok: false, message: "Hanya Super Admin yang boleh mengosongkan seluruh riwayat alert." })
    return
  }
  const state = clearAlertsByMode(mode, req.authUser!.username)
  res.json({ ok: true, state })
})

app.put("/api/settings/map", requireAuth, requireRole("super-admin"), (req, res) => {
  const map = saveMapSettings((req.body ?? {}) as MapSettings, req.authUser!.username)
  res.json({ ok: true, message: "Pengaturan default peta tersimpan.", map, state: readMonitoringState() })
})

app.put("/api/onu/:id/location", requireAuth, (req, res) => {
  const { latitude, longitude, locationNote } = (req.body ?? {}) as {
    latitude?: number
    longitude?: number
    locationNote?: string
  }
  const r = updateOnuLocation(paramId(req.params.id), Number(latitude), Number(longitude), locationNote)
  res.status(r.ok ? 200 : 400).json(r)
})
app.delete("/api/onu/:id/location", requireAuth, (req, res) => {
  const r = clearOnuLocation(paramId(req.params.id))
  res.status(r.ok ? 200 : 400).json(r)
})
app.put("/api/onus/locations/bulk", requireAuth, (req, res) => {
  const { oltId = "", items = [] } = (req.body ?? {}) as { oltId?: string; items?: BulkOnuLocationItem[] }
  if (!oltId || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      ok: false,
      message: "OLT dan daftar koordinat wajib diisi.",
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    })
    return
  }
  const r = bulkUpdateOnuLocations(oltId, items, req.authUser!.username)
  res.status(r.ok ? 200 : 400).json(r)
})

app.post("/api/onu/rename", requireAuth, snmpLimiter, async (req, res) => {
  try {
    const body = (req.body ?? {}) as { oltId?: string; onuId?: string; olt?: { id?: string }; onu?: { id?: string }; nextName?: string }
    const oltId = body.oltId || body.olt?.id || ""
    const onuId = body.onuId || body.onu?.id || ""
    const nextName = typeof body.nextName === "string" ? body.nextName : ""

    const olt = getOltWithSecrets(oltId)
    if (!olt) {
      res.status(404).json({ ok: false, syncedToDevice: false, message: "OLT tidak ditemukan." })
      return
    }
    const onu = readMonitoringState().onus.find((item) => item.id === onuId && item.oltId === olt.id)
    if (!onu) {
      res.status(404).json({ ok: false, syncedToDevice: false, message: "Perangkat ONU tidak ditemukan." })
      return
    }

    const r = await renameOnuOnDevice({ olt, onu, nextName })
    if (!r.ok) {
      res.status(400).json(r)
      return
    }
    const state = applyOnuRenameLocal(onu.id, nextName, r.syncedToDevice, req.authUser!.username)
    res.json({ ...r, state })
  } catch {
    res.status(400).json({ ok: false, syncedToDevice: false, message: "Rename ONU gagal diproses." })
  }
})

app.post("/api/snmp/test", requireAuth, snmpLimiter, async (req, res) => {
  const body = (req.body ?? {}) as Partial<Olt> & { oltId?: string }
  const oltId = body.oltId || body.id
  if (oltId) {
    const saved = getOltWithSecrets(oltId)
    if (!saved) {
      res.status(404).json({ ok: false, message: "OLT tidak ditemukan." })
      return
    }
    const result = await testSnmpConnection(saved)
    const state = updateOltTestResult(saved.id, result.ok, result.values)
    res.json({ ...result, state })
    return
  }

  if (req.authUser!.role !== "super-admin") {
    res.status(403).json({ ok: false, message: "Hanya Super Admin yang boleh menguji target SNMP baru." })
    return
  }

  const result = await testSnmpConnection({
    ipAddress: String(body.ipAddress ?? ""),
    snmpPort: Number(body.snmpPort ?? 161),
    snmpVersion: body.snmpVersion ?? "v2c",
    readCommunity: String(body.readCommunity ?? ""),
    oidProfile: body.oidProfile ?? "vsol-gpon",
  })
  res.status(result.ok ? 200 : 400).json(result)
})

app.post("/api/snmp/test-write", requireAuth, requireRole("super-admin"), snmpLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { oltId?: string; id?: string }
  const oltId = body.oltId || body.id || ""
  const saved = getOltWithSecrets(oltId)
  if (!saved) {
    res.status(404).json({ ok: false, message: "OLT tidak ditemukan." })
    return
  }
  const r = await testOnuRenameWrite(saved)
  res.status(r.ok ? 200 : 400).json(r)
})

app.post("/api/snmp/poll-onu", requireAuth, snmpLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { oltId?: string; id?: string }
  const oltId = body.oltId || body.id || ""
  const savedOlt = getOltWithSecrets(oltId)
  if (!savedOlt) {
    res.status(404).json({ ok: false, message: "OLT tidak ditemukan di database.", onus: [] })
    return
  }

  const lockKey = savedOlt.id
  if (activePolls.has(lockKey)) {
    res.status(409).json({ ok: false, message: `Polling ${savedOlt.name} masih berjalan.`, onus: [] })
    return
  }

  activePolls.add(lockKey)
  try {
    const result = await pollOnusFromOlt(savedOlt)
    const state = readMonitoringState()
    const currentOlt = state.olts.find((i) => i.id === savedOlt.id)
    if (!currentOlt) {
      res.status(200).json({ ...result, ok: false, message: "OLT sudah dihapus.", onus: [], state })
      return
    }

    if (result.ok) {
      const oltWasOffline = currentOlt.status === "offline"
      const polledOnus = preserveLocalOnuMetadata(state, currentOlt, result.onus ?? [])
      const transition = buildTransitionAlerts(state, currentOlt, polledOnus)
      const oltRec = oltWasOffline ? buildOltTransitionAlert(state, currentOlt, "recovery") : null
      const acked = state.alerts.map((a) =>
        transition.recoveredOnuIds.some((id) => a.id.startsWith(`onu-${id}-down-`)) ||
        (oltWasOffline && a.id.startsWith(`olt-${currentOlt.id}-down-`))
          ? { ...a, acknowledged: true }
          : a,
      )
      const nextAlerts = [...(oltRec ? [oltRec] : []), ...transition.alerts, ...acked].slice(0, 300)
      const updatedState = savePollResultForOlt({
        oltId: currentOlt.id,
        status: "online",
        activeOnu: polledOnus.filter((o) => o.status === "online").length,
        lastSeen: "Baru saja",
        polledOnus,
        nextAlerts,
      })
      res.json({ ...result, onus: polledOnus, state: updatedState })
      return
    }

    const oltDown = buildOltTransitionAlert(state, currentOlt, "down", result.message)
    const nextAlerts = [...(oltDown ? [oltDown] : []), ...state.alerts].slice(0, 300)
    const updatedState = savePollResultForOlt({
      oltId: currentOlt.id,
      status: "offline",
      activeOnu: 0,
      lastSeen: `Gagal: ${new Date().toLocaleString("id-ID")}`,
      nextAlerts,
    })
    res.status(200).json({ ...result, state: updatedState })
  } finally {
    activePolls.delete(lockKey)
  }
})

app.get("/api/system/startup", requireAuth, requireRole("super-admin"), (_req, res) => res.json(getStartupStatus()))

app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, message: "Endpoint API tidak ditemukan." })
})

const distDir = path.join(process.cwd(), "dist")
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")))
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ ok: false, message: "Ukuran payload permintaan melebihi batas." })
    return
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ ok: false, message: "Format JSON permintaan tidak valid." })
    return
  }
  res.status(500).json({ ok: false, message: "Terjadi kesalahan internal server." })
})

app.listen(port, host, () => {
  console.log(`[PingLo] Server running at http://127.0.0.1:${port}`)
})
