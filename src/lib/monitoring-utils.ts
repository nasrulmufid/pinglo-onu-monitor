import type { Alert, MonitoringState, OidProfileKey, Olt, Onu } from "@shared/types"

export type OltForm = {
  name: string
  ipAddress: string
  vendor: Olt["vendor"]
  snmpPort: string
  readCommunity: string
  writeCommunity: string
  oidProfile: OidProfileKey
  pollingInterval: string
  writeMode: Olt["writeMode"]
}

export const emptyState: MonitoringState = {
  olts: [],
  onus: [],
  alerts: [],
  settings: { map: { defaultLat: -2.9761, defaultLng: 104.7754, defaultZoom: 12 } },
}

export const emptyOltForm: OltForm = {
  name: "",
  ipAddress: "",
  vendor: "VSOL",
  snmpPort: "161",
  readCommunity: "public",
  writeCommunity: "",
  oidProfile: "vsol-gpon",
  pollingInterval: "60",
  writeMode: "none",
}

export const vendorOptions: Olt["vendor"][] = ["VSOL", "HSGQ GPON", "HSGQ EPON", "Huawei", "ZTE", "FiberHome", "Other"]
export const writeModeOptions: Olt["writeMode"][] = ["none", "snmp", "cli", "api"]

export function profileForVendor(vendor: Olt["vendor"]): OidProfileKey {
  if (vendor === "VSOL") return "vsol-gpon"
  if (vendor === "HSGQ GPON") return "hsgq-gpon"
  if (vendor === "HSGQ EPON") return "hsgq-epon"
  return "generic"
}

export function formFromOlt(olt: Olt): OltForm {
  return {
    name: olt.name,
    ipAddress: olt.ipAddress,
    vendor: olt.vendor,
    snmpPort: String(olt.snmpPort || 161),
    readCommunity: "",
    writeCommunity: "",
    oidProfile: olt.oidProfile,
    pollingInterval: String(olt.pollingInterval || 60),
    writeMode: olt.writeMode,
  }
}

export function formatRx(v: number) {
  return !Number.isFinite(v) || v === 0 ? "-" : `${v} dBm`
}

export function formatTemp(v: number | null | undefined) {
  return v == null || !Number.isFinite(v) ? "-" : `${v} °C`
}

export function getRxQuality(rx: number): { label: string; tone: "good" | "warn" | "bad" | "none"; percent: number } {
  if (!Number.isFinite(rx) || rx === 0) {
    return { label: "Tidak ada data", tone: "none", percent: 0 }
  }
  const percent = Math.round(Math.min(100, Math.max(4, ((rx - -32) / (-12 - -32)) * 100)))
  if (rx <= -27) {
    return { label: "Sinyal Lemah", tone: "bad", percent }
  }
  if (rx <= -24) {
    return { label: "Perhatian", tone: "warn", percent }
  }
  return { label: "Optimal", tone: "good", percent }
}

export function parseAlertDetail(detail: string): { key?: string; value: string }[] {
  return detail
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(": ")
      if (idx > 0) {
        return { key: part.slice(0, idx).trim(), value: part.slice(idx + 2).trim() }
      }
      return { value: part }
    })
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "PL"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

export function buildOperationalAlerts(olts: Olt[], onus: Onu[], savedAlerts: Alert[]): Alert[] {
  const generated: Alert[] = []
  for (const olt of olts) {
    if (olt.status !== "online") {
      generated.push({
        id: `olt-${olt.id}-offline`,
        oltId: olt.id,
        title: `${olt.name} tidak online`,
        detail: `OLT ${olt.ipAddress} belum berhasil dipolling.`,
        severity: "critical",
        createdAt: olt.lastSeen,
        acknowledged: false,
      })
    }
  }
  for (const onu of onus) {
    const olt = olts.find((i) => i.id === onu.oltId)
    const hasSavedDown = savedAlerts.some((a) => !a.acknowledged && a.id.startsWith(`onu-${onu.id}-down-`))
    if (onu.status !== "online") {
      if (!hasSavedDown) {
        generated.push({
          id: `onu-${onu.id}-down`,
          oltId: onu.oltId,
          title: `ONT down: ${onu.name}`,
          detail: `OLT: ${olt?.name ?? "-"} | PON ${onu.ponPort}:${onu.onuIndex} | SN: ${onu.serialNumber} | Alasan: ${onu.downReason || "Down"}`,
          severity: "critical",
          createdAt: onu.lastSeen,
          acknowledged: false,
        })
      }
      continue
    }
    if (onu.rxPower !== 0 && onu.rxPower <= -27) {
      generated.push({
        id: `onu-${onu.id}-rx`,
        oltId: onu.oltId,
        title: `RX lemah: ${onu.name}`,
        detail: `OLT: ${olt?.name ?? "-"} | PON ${onu.ponPort}:${onu.onuIndex} | RX: ${formatRx(onu.rxPower)}`,
        severity: "warning",
        createdAt: onu.lastSeen,
        acknowledged: false,
      })
    }
    if (onu.temperatureC != null && onu.temperatureC >= 55) {
      generated.push({
        id: `onu-${onu.id}-temp`,
        oltId: onu.oltId,
        title: `Suhu tinggi: ${onu.name}`,
        detail: `OLT: ${olt?.name ?? "-"} | PON ${onu.ponPort}:${onu.onuIndex} | Suhu: ${formatTemp(onu.temperatureC)}`,
        severity: "warning",
        createdAt: onu.lastSeen,
        acknowledged: false,
      })
    }
  }
  return [...generated, ...savedAlerts]
}
