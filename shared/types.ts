export type OltStatus = "online" | "degraded" | "offline"
export type AlertSeverity = "critical" | "warning" | "info"
export type OltVendor = "VSOL" | "HSGQ GPON" | "HSGQ EPON" | "Huawei" | "ZTE" | "FiberHome" | "Other"
export type OidProfileKey = "vsol-gpon" | "hsgq-gpon" | "hsgq-epon" | "generic"

export type Olt = {
  id: string
  name: string
  ipAddress: string
  vendor: OltVendor
  model: string
  location: string
  status: OltStatus
  uptime: string
  cpuLoad: number
  memoryLoad: number
  ponPorts: number
  activeOnu: number
  pollingInterval: number
  snmpVersion: "v1" | "v2c" | "v3"
  snmpPort: number
  readCommunity: string
  writeCommunity?: string
  hasReadCommunity?: boolean
  hasWriteCommunity?: boolean
  oidProfile: OidProfileKey
  writeMode: "none" | "snmp" | "cli" | "api"
  lastSeen: string
  systemInfo?: Record<string, string>
}

export type Onu = {
  id: string
  oltId: string
  name: string
  serialNumber: string
  ponPort: string
  onuIndex: string
  status: "online" | "offline" | "los"
  rxPower: number
  txPower: number
  temperatureC?: number | null
  downReason?: string | null
  distanceMeters: number
  lastSeen: string
  syncStatus: "synced" | "pending" | "failed" | "local-only"
  latitude?: number | null
  longitude?: number | null
  locationNote?: string | null
  locationUpdatedAt?: string | null
}

export type Alert = {
  id: string
  oltId: string
  title: string
  detail: string
  severity: AlertSeverity
  createdAt: string
  acknowledged: boolean
}

export type MapSettings = {
  defaultLat: number
  defaultLng: number
  defaultZoom: number
}

export type MonitoringSettings = {
  map: MapSettings
}

export type MonitoringState = {
  olts: Olt[]
  onus: Onu[]
  alerts: Alert[]
  settings: MonitoringSettings
}

export type RenameOnuRequest = {
  olt: Olt
  onu: Onu
  nextName: string
}

export type RenameOnuResult = {
  ok: boolean
  syncedToDevice: boolean
  message: string
}

export type StartupStatus = {
  enabled: boolean
  platform: string
  servicePath: string
  commands: string[]
  disableCommands: string[]
}

export type BulkOnuLocationItem = {
  onuId?: string
  name?: string
  serialNumber?: string
  longitude: number
  latitude: number
  locationNote?: string
}

export type BulkOnuLocationResult = {
  ok: boolean
  message: string
  updatedCount: number
  skippedCount: number
  failedCount: number
  errors?: string[]
  state?: MonitoringState
}
