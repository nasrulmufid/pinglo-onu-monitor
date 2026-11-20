import type { Olt, Onu, RenameOnuRequest, RenameOnuResult } from "../shared/types"
import { getOidProfile } from "../shared/oid-catalog"

export const baseSystemOids = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysObjectId: "1.3.6.1.2.1.1.2.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  sysLocation: "1.3.6.1.2.1.1.6.0",
}

type SnmpTestTarget = Pick<Olt, "ipAddress" | "snmpPort" | "snmpVersion" | "readCommunity" | "oidProfile">
type SnmpWriteTarget = Pick<Olt, "ipAddress" | "snmpPort" | "snmpVersion" | "readCommunity" | "writeCommunity" | "oidProfile">
type SnmpSession = ReturnType<typeof import("net-snmp").createSession>
type SnmpRow = { oid: string; value: string }

type PartialOnu = {
  ontIndex: string; name?: string; serial?: string; model?: string; runState?: string;
  rxPower?: number | null; txPower?: number | null; temperature?: number | null; lastDownReason?: string;
}

const hsgqGponOids = {
  ontInfoBase: "1.3.6.1.4.1.50224.3.12.2.1", ontName: "1.3.6.1.4.1.50224.3.12.2.1.2",
  runState: "1.3.6.1.4.1.50224.3.12.2.1.4", serial: "1.3.6.1.4.1.50224.3.12.2.1.15",
  lastDownReason: "1.3.6.1.4.1.50224.3.12.2.1.22", opticalBase: "1.3.6.1.4.1.50224.3.12.3.1",
  rxPower: "1.3.6.1.4.1.50224.3.12.3.1.4", txPower: "1.3.6.1.4.1.50224.3.12.3.1.5",
  temperature: "1.3.6.1.4.1.50224.3.12.3.1.8",
}

const hsgqEponOids = {
  ontInfoBase: "1.3.6.1.4.1.50224.3.3.2.1", ontName: "1.3.6.1.4.1.50224.3.3.2.1.2",
  runState: "1.3.6.1.4.1.50224.3.3.2.1.8", serial: "1.3.6.1.4.1.50224.3.3.2.1.7",
  lastDownReason: "1.3.6.1.4.1.50224.3.3.2.1.31", opticalBase: "1.3.6.1.4.1.50224.3.3.3.1",
  rxPower: "1.3.6.1.4.1.50224.3.3.3.1.4", txPower: "", temperature: "1.3.6.1.4.1.50224.3.3.3.1.8",
}

const vsolGponOids = {
  productType: "1.3.6.1.4.1.37950.1.1.5.10.14.6.0", statusCode: "1.3.6.1.4.1.37950.1.1.6.1.1.1.1.5",
  lastDownReason: "1.3.6.1.4.1.37950.1.1.6.1.1.1.1.10", serial: "1.3.6.1.4.1.37950.1.1.6.1.1.2.1.5",
  model: "1.3.6.1.4.1.37950.1.1.6.1.1.2.1.6", temperature: "1.3.6.1.4.1.37950.1.1.6.1.1.3.1.3",
  rxPower: "1.3.6.1.4.1.37950.1.1.6.1.1.3.1.7", ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifAlias: "1.3.6.1.2.1.31.1.1.1.18",
}

function valueToText(value: unknown) {
  if (Buffer.isBuffer(value)) {
    const text = value.toString("utf8").replace(/\0/g, "").trim()
    return /^[\x20-\x7E\r\n\t]*$/.test(text) ? text : value.toString("hex").toUpperCase()
  }
  if (value === null || value === undefined) return ""
  return String(value)
}

function oidCompare(a: string, b: string) {
  const left = a.split(".").map(Number), right = b.split(".").map(Number)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const lv = left[i] ?? -1, rv = right[i] ?? -1
    if (lv !== rv) return lv - rv
  }
  return 0
}

function isInSubtree(oid: string, rootOid: string) { return oid === rootOid || oid.startsWith(`${rootOid}.`) }
function toNumber(v: string | undefined) { if (!v || v === "NULL" || v === "N/A") return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function opticalScale(v: string | undefined) { const n = toNumber(v); return n === null || n === -2147483648 ? null : n / 100 }

function decodeHsgqOntIndex(index: string) {
  const raw = Number(index)
  if (!Number.isFinite(raw)) return { ponPort: "-", ontId: "-", ponOnt: "-" }
  const base = raw - 16777216
  const ponPort = Math.floor(base / 256), ontId = raw % 256
  return { ponPort: String(ponPort), ontId: String(ontId), ponOnt: `${ponPort}/${ontId}` }
}

function statusFromRunState(s: string | undefined): Onu["status"] { return String(s) === "1" ? "online" : "offline" }
function statusFromVsolCode(s: string | undefined): Onu["status"] { return String(s) === "3" ? "online" : "offline" }

function normalizeDownReason(value: string | undefined) {
  const text = String(value || "").trim()
  if (!text || text === "0") return null
  const map: Record<string, string> = { "1": "LOS", "2": "LOSi", "3": "LOFi", "4": "Dying gasp", "5": "LOAMi", "6": "Deactive", "7": "Reset", "8": "Re-register", "9": "Power off" }
  return map[text] || text
}

function createSnmpSession(snmp: typeof import("net-snmp"), olt: SnmpTestTarget) {
  return snmp.createSession(olt.ipAddress, olt.readCommunity, {
    version: olt.snmpVersion === "v1" ? snmp.Version1 : snmp.Version2c,
    port: olt.snmpPort || 161, timeout: 8000, retries: 1,
  })
}

function createSnmpWriteSession(snmp: typeof import("net-snmp"), olt: SnmpWriteTarget) {
  const community = olt.writeCommunity?.trim()
  if (!community) throw new Error("Write Community belum diisi.")
  return snmp.createSession(olt.ipAddress, community, {
    version: olt.snmpVersion === "v1" ? snmp.Version1 : snmp.Version2c,
    port: olt.snmpPort || 161, timeout: 8000, retries: 1,
  })
}

function hsgqOntIndexFromOnu(olt: Olt, onu: Onu) {
  const idPrefix = `${olt.id}-`
  if (onu.id.startsWith(idPrefix)) return onu.id.slice(idPrefix.length)
  const ponPort = Number(onu.ponPort), onuIndex = Number(onu.onuIndex)
  if (!Number.isFinite(ponPort) || !Number.isFinite(onuIndex)) return null
  return String(16777216 + ponPort * 256 + onuIndex)
}

function decodeVsolOntIndex(index: string) {
  const [ponPort, ontId] = String(index || "").split(".")
  return { ponPort: ponPort || "-", ontId: ontId || "-", ponOnt: ponPort && ontId ? `${ponPort}/${ontId}` : "-" }
}

function getVsolPonCount(productType: string | undefined) {
  const match = String(productType || "").match(/OLT-(\d+)G/i)
  const count = match ? Number(match[1]) : 4
  return Number.isFinite(count) && count > 0 ? count : 4
}

function parseVsolIfDescr(value: string | undefined) {
  const match = String(value || "").trim().match(/^GPON0?(\d+)ONU(\d+)\s*(.*)$/i)
  if (!match) return null
  const pon = Number(match[1]), ont = Number(match[2]), name = String(match[3] || "").trim()
  if (!pon || !ont) return null
  return { ontIndex: `${pon}.${ont}`, name }
}

function vsolInterfaceIndexFromOnu(onu: Onu) {
  const ponPort = Number(onu.ponPort), onuIndex = Number(onu.onuIndex)
  if (!Number.isFinite(ponPort) || !Number.isFinite(onuIndex) || ponPort < 1 || onuIndex < 1) return null
  if (ponPort === 1) return String(onuIndex + 9)
  if (ponPort === 2) return String(onuIndex + 81)
  if (ponPort === 3) return String(onuIndex + 144)
  if (ponPort === 4) return String(onuIndex + 145)
  return null
}

function isDefaultVsolAlias(value: string | undefined) { return /^GPON0\/\d+:\d+$/i.test(String(value || "").trim()) }

function findVsolIfDescrTarget(rows: SnmpRow[], onu?: Onu) {
  if (onu) {
    const ontIndex = `${onu.ponPort}.${onu.onuIndex}`
    const found = rows.find((r) => parseVsolIfDescr(r.value)?.ontIndex === ontIndex)
    if (found) return found
  }
  return rows.find((r) => parseVsolIfDescr(r.value))
}

function findVsolAliasTarget(rows: SnmpRow[], onu?: Onu) {
  if (onu) {
    const iface = vsolInterfaceIndexFromOnu(onu)
    const found = iface ? rows.find((r) => r.oid === `${vsolGponOids.ifAlias}.${iface}`) : undefined
    if (found) return found
  }
  return rows.find((r) => r.value && !isDefaultVsolAlias(r.value)) ?? rows.find((r) => r.value)
}

function vsolInterfaceIndexFromOid(oid: string, baseOid: string) { return oid.startsWith(`${baseOid}.`) ? oid.replace(`${baseOid}.`, "") : null }

function mapVsolInterfaceIndexes(ifDescrRows: SnmpRow[]) {
  const indexes = new Map<string, string>()
  for (const row of ifDescrRows) {
    const parsed = parseVsolIfDescr(row.value)
    const iface = vsolInterfaceIndexFromOid(row.oid, vsolGponOids.ifDescr)
    if (parsed?.ontIndex && iface) indexes.set(parsed.ontIndex, iface)
  }
  return indexes
}

async function walk(snmp: typeof import("net-snmp"), session: SnmpSession, rootOid: string, maxRows = 12000) {
  const rows: SnmpRow[] = []
  let cursor = rootOid
  while (rows.length < maxRows) {
    const varbinds = await new Promise<Array<Array<{ oid: string; value: unknown }> | { oid: string; value: unknown }>>((resolve, reject) => {
      session.getBulk([cursor], 0, 25, (error, result) => (error ? reject(error) : resolve(result)))
    })
    const list = Array.isArray(varbinds[0]) ? (varbinds[0] as Array<{ oid: string; value: unknown }>) : (varbinds as Array<{ oid: string; value: unknown }>)
    let moved = false
    for (const vb of list) {
      if (!vb?.oid || !isInSubtree(vb.oid, rootOid)) return rows
      if (oidCompare(vb.oid, cursor) <= 0) continue
      if (!snmp.isVarbindError(vb)) rows.push({ oid: vb.oid, value: valueToText(vb.value) })
      cursor = vb.oid
      moved = true
      if (rows.length >= maxRows) return rows
    }
    if (!moved) return rows
  }
  return rows
}

async function getRows(snmp: typeof import("net-snmp"), session: SnmpSession, oids: string[]) {
  if (oids.length === 0) return [] as SnmpRow[]
  return new Promise<SnmpRow[] | null>((resolve) => {
    session.get(oids, (error, varbinds) => {
      if (error) { resolve(null); return }
      resolve(varbinds.filter((vb) => !snmp.isVarbindError(vb)).map((vb) => ({ oid: vb.oid, value: valueToText(vb.value) })))
    })
  })
}

async function getRowsWithFallback(snmp: typeof import("net-snmp"), session: SnmpSession, oids: string[]): Promise<SnmpRow[]> {
  const rows = await getRows(snmp, session, oids)
  if (rows !== null) return rows
  if (oids.length <= 1) return []
  const mid = Math.ceil(oids.length / 2)
  const [l, r] = await Promise.all([getRowsWithFallback(snmp, session, oids.slice(0, mid)), getRowsWithFallback(snmp, session, oids.slice(mid))])
  return [...l, ...r]
}

async function getColumnForIndexes(snmp: typeof import("net-snmp"), session: SnmpSession, baseOid: string, indexes: string[], chunkSize = 24) {
  const rows: SnmpRow[] = []
  for (let i = 0; i < indexes.length; i += chunkSize) {
    const chunk = indexes.slice(i, i + chunkSize).map((item) => `${baseOid}.${item}`)
    rows.push(...(await getRowsWithFallback(snmp, session, chunk)))
  }
  return rows
}

function assignByColumn(
  target: Map<string, PartialOnu>, rows: SnmpRow[], baseOid: string, key: keyof PartialOnu,
  transform: (v: string) => PartialOnu[keyof PartialOnu] = (v) => v,
) {
  rows.filter((r) => r.oid.startsWith(`${baseOid}.`)).forEach((r) => {
    const idx = r.oid.replace(`${baseOid}.`, "")
    if (!target.has(idx)) target.set(idx, { ontIndex: idx })
    const item = target.get(idx)
    if (item) Object.assign(item, { [key]: transform(r.value) })
  })
}

function assignVsolNames(target: Map<string, PartialOnu>, rows: SnmpRow[]) {
  rows.forEach((r) => {
    const parsed = parseVsolIfDescr(r.value)
    if (!parsed?.name) return
    if (!target.has(parsed.ontIndex)) target.set(parsed.ontIndex, { ontIndex: parsed.ontIndex })
    const item = target.get(parsed.ontIndex)
    if (item) item.name = parsed.name
  })
}

function assignVsolAliasNames(target: Map<string, PartialOnu>, rows: SnmpRow[], mapIdx: Map<string, string>) {
  rows.forEach((r) => {
    const iface = vsolInterfaceIndexFromOid(r.oid, vsolGponOids.ifAlias)
    const val = String(r.value || "").trim()
    if (!iface || !val || isDefaultVsolAlias(val)) return
    for (const [ontIndex, mapped] of mapIdx.entries()) {
      if (mapped !== iface) continue
      if (!target.has(ontIndex)) target.set(ontIndex, { ontIndex })
      const item = target.get(ontIndex)
      if (item) item.name = val
      return
    }
  })
}

function assignOpticalColumn(target: Map<string, PartialOnu>, rows: SnmpRow[], baseOid: string, key: keyof PartialOnu) {
  if (!baseOid) return
  rows.filter((r) => r.oid.startsWith(`${baseOid}.`)).forEach((r) => {
    const parts = r.oid.replace(`${baseOid}.`, "").split(".")
    const idx = parts[0], suffix = parts.slice(1).join(".")
    const isMain = suffix === "" || suffix === "0.0"
    if (!target.has(idx)) target.set(idx, { ontIndex: idx })
    const item = target.get(idx)
    if (item && (isMain || item[key] === undefined || item[key] === null)) Object.assign(item, { [key]: opticalScale(r.value) })
  })
}

function sortOnus(list: Onu[]) {
  return list.sort((a, b) => (Number(a.ponPort) !== Number(b.ponPort) ? Number(a.ponPort) - Number(b.ponPort) : Number(a.onuIndex) - Number(b.onuIndex)))
}

function mapVsolOnus(olt: Olt, items: PartialOnu[]): Onu[] {
  return sortOnus(
    items.filter((item) => item.serial || item.model || item.rxPower !== undefined || item.runState).map((item) => {
      const d = decodeVsolOntIndex(item.ontIndex)
      return {
        id: `${olt.id}-${item.ontIndex}`, oltId: olt.id,
        name: item.name || (item.serial ? `ONU-${item.serial}` : `ONU-${d.ponOnt}`),
        serialNumber: item.serial || "-", ponPort: d.ponPort, onuIndex: d.ontId,
        status: statusFromVsolCode(item.runState), rxPower: item.rxPower ?? 0, txPower: item.txPower ?? 0,
        temperatureC: item.temperature ?? null, downReason: normalizeDownReason(item.lastDownReason),
        distanceMeters: 0, lastSeen: "Baru saja", syncStatus: "synced" as const,
      }
    }),
  )
}

function mapHsgqOnus(olt: Olt, items: PartialOnu[]): Onu[] {
  return sortOnus(
    items.filter((item) => item.name || item.serial || item.runState || item.rxPower !== undefined).map((item) => {
      const d = decodeHsgqOntIndex(item.ontIndex)
      return {
        id: `${olt.id}-${item.ontIndex}`, oltId: olt.id,
        name: item.name || (item.serial ? `ONU-${item.serial}` : `ONU-${d.ponOnt}`),
        serialNumber: item.serial || "-", ponPort: d.ponPort, onuIndex: d.ontId,
        status: statusFromRunState(item.runState), rxPower: item.rxPower ?? 0, txPower: item.txPower ?? 0,
        temperatureC: item.temperature ?? null, downReason: normalizeDownReason(item.lastDownReason),
        distanceMeters: 0, lastSeen: "Baru saja", syncStatus: "synced" as const,
      }
    }),
  )
}

async function pollVsolOnusFromOlt(snmp: typeof import("net-snmp"), session: SnmpSession, olt: Olt) {
  const sysRows = await getRowsWithFallback(snmp, session, [
    baseSystemOids.sysDescr, baseSystemOids.sysObjectId, baseSystemOids.sysUpTime, baseSystemOids.sysName, vsolGponOids.productType,
  ])
  const sysVals = Object.fromEntries(sysRows.map((r) => [r.oid, r.value]))
  const ponCount = getVsolPonCount(sysVals[vsolGponOids.productType])
  const gen: string[] = []
  for (let p = 1; p <= ponCount; p += 1) for (let o = 1; o <= 128; o += 1) gen.push(`${p}.${o}`)

  const onusByIndex = new Map<string, PartialOnu>()
  const statusRows = await getColumnForIndexes(snmp, session, vsolGponOids.statusCode, gen, 24)
  assignByColumn(onusByIndex, statusRows, vsolGponOids.statusCode, "runState")

  const indexes = [...onusByIndex.keys()].sort((a, b) => {
    const l = decodeVsolOntIndex(a), r = decodeVsolOntIndex(b)
    return Number(l.ponPort) !== Number(r.ponPort) ? Number(l.ponPort) - Number(r.ponPort) : Number(l.ontId) - Number(r.ontId)
  })

  const [serialRows, modelRows, downRows, tempRows, rxRows, ifDescrRows, ifAliasRows] = await Promise.all([
    getColumnForIndexes(snmp, session, vsolGponOids.serial, indexes, 24),
    getColumnForIndexes(snmp, session, vsolGponOids.model, indexes, 24),
    getColumnForIndexes(snmp, session, vsolGponOids.lastDownReason, indexes, 24),
    getColumnForIndexes(snmp, session, vsolGponOids.temperature, indexes, 12),
    getColumnForIndexes(snmp, session, vsolGponOids.rxPower, indexes, 12),
    walk(snmp, session, vsolGponOids.ifDescr, 320),
    walk(snmp, session, vsolGponOids.ifAlias, 320),
  ])

  assignByColumn(onusByIndex, serialRows, vsolGponOids.serial, "serial")
  assignByColumn(onusByIndex, modelRows, vsolGponOids.model, "model")
  assignByColumn(onusByIndex, downRows, vsolGponOids.lastDownReason, "lastDownReason")
  assignByColumn(onusByIndex, tempRows, vsolGponOids.temperature, "temperature", toNumber)
  assignByColumn(onusByIndex, rxRows, vsolGponOids.rxPower, "rxPower", toNumber)
  assignVsolNames(onusByIndex, ifDescrRows)
  assignVsolAliasNames(onusByIndex, ifAliasRows, mapVsolInterfaceIndexes(ifDescrRows))

  return mapVsolOnus(olt, [...onusByIndex.values()])
}

export async function testSnmpConnection(olt: SnmpTestTarget) {
  if (!olt.ipAddress || !olt.readCommunity) return { ok: false, message: "IP dan community SNMP wajib diisi." }
  const snmp = await import("net-snmp")
  const profile = getOidProfile(olt.oidProfile)
  const systemOids = profile.items.filter((i) => i.kind === "system").map((i) => i.oid)
  const session = createSnmpSession(snmp, olt)
  try {
    const values = await new Promise<Record<string, string>>((resolve, reject) => {
      session.get(systemOids, (error, varbinds) => {
        if (error) { reject(error); return }
        const res: Record<string, string> = {}
        for (const vb of varbinds) res[vb.oid] = valueToText(vb.value)
        resolve(res)
      })
    })
    return { ok: true, message: `SNMP berhasil ke ${olt.ipAddress}:${olt.snmpPort || 161}. Profil OID: ${profile.name}.`, values, oids: profile.items }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "SNMP test gagal.", oids: profile.items }
  } finally {
    session.close()
  }
}

export async function pollOnusFromOlt(olt: Olt) {
  if (!olt.ipAddress || !olt.readCommunity) return { ok: false, message: "IP dan community SNMP wajib diisi.", onus: [] as Onu[] }
  if (olt.oidProfile !== "hsgq-gpon" && olt.oidProfile !== "hsgq-epon" && olt.oidProfile !== "vsol-gpon") {
    return { ok: false, message: `Polling ONU untuk profile ${olt.oidProfile} belum aktif. Aktif: VSOL GPON, HSGQ GPON/EPON.`, onus: [] as Onu[] }
  }

  const snmp = await import("net-snmp")
  const session = createSnmpSession(snmp, olt)
  try {
    if (olt.oidProfile === "vsol-gpon") {
      const onus = await pollVsolOnusFromOlt(snmp, session, olt)
      return { ok: true, message: `Polling ONU selesai. Ditemukan ${onus.length} ONU/ONT dari ${olt.name}.`, onus }
    }
    const oids = olt.oidProfile === "hsgq-epon" ? hsgqEponOids : hsgqGponOids
    const [ontInfoRows, opticalRows] = await Promise.all([walk(snmp, session, oids.ontInfoBase), walk(snmp, session, oids.opticalBase)])
    const onusByIndex = new Map<string, PartialOnu>()
    assignByColumn(onusByIndex, ontInfoRows, oids.ontName, "name")
    assignByColumn(onusByIndex, ontInfoRows, oids.runState, "runState")
    assignByColumn(onusByIndex, ontInfoRows, oids.serial, "serial")
    assignByColumn(onusByIndex, ontInfoRows, oids.lastDownReason, "lastDownReason")
    assignOpticalColumn(onusByIndex, opticalRows, oids.rxPower, "rxPower")
    assignOpticalColumn(onusByIndex, opticalRows, oids.txPower, "txPower")
    assignOpticalColumn(onusByIndex, opticalRows, oids.temperature, "temperature")

    const onus = mapHsgqOnus(olt, [...onusByIndex.values()])
    return { ok: true, message: `Polling ONU selesai. Ditemukan ${onus.length} ONU/ONT dari ${olt.name}.`, onus }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Polling ONU gagal.", onus: [] as Onu[] }
  } finally {
    session.close()
  }
}

function sessionSet(session: SnmpSession, type: number, oid: string, value: string) {
  return new Promise<void>((resolve, reject) => {
    session.set([{ oid, type, value }], (error) => (error ? reject(error) : resolve()))
  })
}

export async function testOnuRenameWrite(olt: Olt) {
  if (!olt.writeCommunity?.trim()) return { ok: false, message: "Write Community belum diisi." }
  if (olt.writeMode !== "snmp") return { ok: false, message: "Mode rename ONU harus SNMP untuk Test Write." }
  if (olt.oidProfile === "hsgq-epon") return { ok: false, message: "HSGQ EPON belum mendukung rename via SNMP." }
  if (olt.oidProfile !== "hsgq-gpon" && olt.oidProfile !== "vsol-gpon") return { ok: false, message: `Test Write belum tersedia untuk ${olt.oidProfile}.` }

  const snmp = await import("net-snmp")
  const isVsol = olt.oidProfile === "vsol-gpon"
  const readSession = createSnmpSession(snmp, olt)
  try {
    const rows = isVsol ? await walk(snmp, readSession, vsolGponOids.ifAlias, 320) : await walk(snmp, readSession, hsgqGponOids.ontName, 1)
    const target = isVsol ? findVsolAliasTarget(rows) : rows[0]
    if (!target?.oid || !target.value) return { ok: false, message: "Belum ada data nama/alias ONU yang terbaca dari OLT." }
    const writeSession = createSnmpWriteSession(snmp, olt)
    try {
      await sessionSet(writeSession, snmp.ObjectType.OctetString, target.oid, target.value)
      return {
        ok: true,
        message: isVsol
          ? "Write Community valid untuk alias VSOL. Nama dari aplikasi akan dijaga saat polling ulang."
          : "Write Community valid. Rename ONU/ONT siap digunakan.",
      }
    } finally {
      writeSession.close()
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : ""
    if (isVsol && msg.includes("NotWritable")) {
      return { ok: false, message: "OID alias VSOL ditolak (NotWritable). Pastikan SNMP Read-Write aktif dan Write Community benar." }
    }
    return { ok: false, message: error instanceof Error ? `Test Write gagal: ${error.message}` : "Test Write gagal." }
  } finally {
    readSession.close()
  }
}

export async function renameOnuOnDevice({ olt, onu, nextName }: RenameOnuRequest): Promise<RenameOnuResult> {
  const cleanName = nextName.trim()
  if (!cleanName) return { ok: false, syncedToDevice: false, message: "Nama ONU/ONT tidak boleh kosong." }
  if (cleanName.length > 64) return { ok: false, syncedToDevice: false, message: "Nama ONU/ONT maksimal 64 karakter." }
  if (olt.writeMode === "none") return { ok: true, syncedToDevice: false, message: "Nama tersimpan di aplikasi (write mode nonaktif)." }

  if (olt.writeMode === "snmp") {
    if (olt.oidProfile === "hsgq-epon") return { ok: false, syncedToDevice: false, message: "HSGQ EPON belum mendukung rename via SNMP." }
    if (olt.oidProfile !== "hsgq-gpon" && olt.oidProfile !== "vsol-gpon") {
      return { ok: false, syncedToDevice: false, message: `SNMP rename belum tersedia untuk ${olt.oidProfile}.` }
    }
    const snmp = await import("net-snmp")
    if (olt.oidProfile === "vsol-gpon") {
      const readSession = createSnmpSession(snmp, olt)
      try {
        const ifDescrRows = await walk(snmp, readSession, vsolGponOids.ifDescr, 320)
        const target = findVsolIfDescrTarget(ifDescrRows, onu)
        const targetIndex = (target ? vsolInterfaceIndexFromOid(target.oid, vsolGponOids.ifDescr) : null) || vsolInterfaceIndexFromOnu(onu)
        if (!targetIndex) return { ok: false, syncedToDevice: false, message: "Index ONU VSOL tidak valid." }
        const writeSession = createSnmpWriteSession(snmp, olt)
        try {
          await sessionSet(writeSession, snmp.ObjectType.OctetString, `${vsolGponOids.ifAlias}.${targetIndex}`, cleanName)
          return { ok: true, syncedToDevice: false, message: `Nama ${onu.serialNumber} disimpan di aplikasi & alias VSOL.` }
        } finally {
          writeSession.close()
        }
      } catch (error) {
        return { ok: false, syncedToDevice: false, message: error instanceof Error ? `Rename VSOL gagal: ${error.message}` : "Rename VSOL gagal." }
      } finally {
        readSession.close()
      }
    }

    const deviceIndex = hsgqOntIndexFromOnu(olt, onu)
    if (!deviceIndex) return { ok: false, syncedToDevice: false, message: "Index ONU/ONT tidak valid." }
    const writeSession = createSnmpWriteSession(snmp, olt)
    try {
      await sessionSet(writeSession, snmp.ObjectType.OctetString, `${hsgqGponOids.ontName}.${deviceIndex}`, cleanName)
      return { ok: true, syncedToDevice: true, message: `Nama ${onu.serialNumber} berhasil diubah di aplikasi dan OLT.` }
    } catch (error) {
      return { ok: false, syncedToDevice: false, message: error instanceof Error ? `Rename ke OLT gagal: ${error.message}` : "Rename gagal." }
    } finally {
      writeSession.close()
    }
  }

  return { ok: true, syncedToDevice: false, message: `Nama tersimpan di aplikasi (mode ${olt.writeMode.toUpperCase()}).` }
}
