import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { buildOperationalAlerts, emptyState, type OltForm } from "@/lib/monitoring-utils"
import type { Alert, BulkOnuLocationItem, BulkOnuLocationResult, MapSettings, MonitoringState, Olt, Onu } from "@shared/types"

type MonitoringContextValue = {
  state: MonitoringState
  loading: boolean
  notice: string
  pollingOltId: string | null
  locationDialogOnu: Onu | null
  setLocationDialogOnu: (onu: Onu | null) => void
  operationalAlerts: Alert[]
  openAlertCount: number
  onlineOltCount: number
  onlineOnuCount: number
  downOnuCount: number
  mappedOnuCount: number
  weakRxCount: number
  highTempCount: number
  saveOnuLocation: (onuId: string, latitude: number, longitude: number, locationNote: string) => Promise<void>
  bulkSaveOnuLocations: (oltId: string, items: BulkOnuLocationItem[]) => Promise<BulkOnuLocationResult>
  clearOnuLocation: (onuId: string) => Promise<void>
  saveMapSettings: (nextMap: MapSettings) => Promise<void>
  saveOlt: (form: OltForm, editingOltId: string | null) => Promise<boolean>
  removeOlt: (olt: Olt) => Promise<void>
  testConnection: (olt: Olt) => Promise<void>
  testWrite: (olt: Olt) => Promise<void>
  pollOnu: (olt: Olt, opts?: { silent?: boolean }) => Promise<void>
  saveRename: (onu: Onu, nextName: string) => Promise<boolean>
  clearAlerts: (mode: "acknowledged" | "all") => Promise<void>
  resetDefault: () => Promise<void>
}

const MonitoringContext = createContext<MonitoringContextValue | null>(null)

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MonitoringState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("Memuat database SQLite...")
  const [pollingOltId, setPollingOltId] = useState<string | null>(null)
  const [locationDialogOnu, setLocationDialogOnu] = useState<Onu | null>(null)

  const stateRef = useRef(state)
  const pollingLocksRef = useRef(new Set<string>())
  const pollOnuRef = useRef<(olt: Olt, opts?: { silent?: boolean }) => Promise<void>>(async () => undefined)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    let active = true
    fetch("/api/monitoring/state")
      .then((r) => r.json() as Promise<MonitoringState>)
      .then((data) => {
        if (!active) return
        setState(data)
        setNotice(data.olts.length === 0 ? "Database SQLite siap. Tambahkan OLT untuk mulai monitoring." : "Database SQLite berhasil dimuat.")
      })
      .catch(() => {
        if (!active) return
        setNotice("Gagal memuat database dari server lokal.")
        toast.error("Gagal memuat database dari server lokal.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const commitState = useCallback(async (next: MonitoringState) => {
    setState(next)
    const res = await fetch("/api/monitoring/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
    if (!res.ok) throw new Error("Gagal menyimpan ke SQLite.")
    const saved = (await res.json()) as MonitoringState
    setState(saved)
  }, [])

  const saveOnuLocation = useCallback(async (onuId: string, latitude: number, longitude: number, locationNote: string) => {
    const res = await fetch(`/api/onu/${encodeURIComponent(onuId)}/location`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude, locationNote }),
    })
    const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
    if (result.state) setState(result.state)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [])

  const bulkSaveOnuLocations = useCallback(async (oltId: string, items: BulkOnuLocationItem[]): Promise<BulkOnuLocationResult> => {
    try {
      const res = await fetch("/api/onus/locations/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oltId, items }),
      })
      const result = (await res.json()) as BulkOnuLocationResult
      if (result.state) setState(result.state)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
      return result
    } catch {
      const fail: BulkOnuLocationResult = {
        ok: false,
        message: "Gagal mengirim data koordinat ke server.",
        updatedCount: 0,
        skippedCount: 0,
        failedCount: items.length,
      }
      toast.error(fail.message)
      return fail
    }
  }, [])

  const clearOnuLocation = useCallback(async (onuId: string) => {
    const res = await fetch(`/api/onu/${encodeURIComponent(onuId)}/location`, { method: "DELETE" })
    const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
    if (result.state) setState(result.state)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [])

  const saveMapSettings = useCallback(async (nextMap: MapSettings) => {
    const res = await fetch("/api/settings/map", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextMap),
    })
    const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
    if (result.state) setState(result.state)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [])

  const saveOlt = useCallback(
    async (form: OltForm, editingOltId: string | null) => {
      const name = form.name.trim()
      const ipAddress = form.ipAddress.trim()
      const readCommunity = form.readCommunity.trim()
      if (!name || !ipAddress || !readCommunity) {
        toast.error("Nama OLT, IP/Host, dan Read Community wajib diisi.")
        return false
      }
      const payload = {
        name,
        ipAddress,
        vendor: form.vendor,
        pollingInterval: Number(form.pollingInterval) || 60,
        snmpPort: Number(form.snmpPort) || 161,
        readCommunity,
        writeCommunity: form.writeCommunity.trim(),
        oidProfile: form.oidProfile,
        writeMode: form.writeMode,
      }
      try {
        const cur = stateRef.current
        if (editingOltId) {
          await commitState({ ...cur, olts: cur.olts.map((o) => (o.id === editingOltId ? { ...o, ...payload } : o)) })
          toast.success(`${name} berhasil diperbarui.`)
          return true
        }
        const nextOlt: Olt = {
          id: `olt-${Date.now()}`,
          ...payload,
          model: "-",
          location: "-",
          status: "offline",
          uptime: "-",
          cpuLoad: 0,
          memoryLoad: 0,
          ponPorts: 0,
          activeOnu: 0,
          snmpVersion: "v2c",
          lastSeen: "Belum pernah dipolling",
        }
        await commitState({ ...cur, olts: [...cur.olts, nextOlt] })
        toast.success(`${name} ditambahkan ke SQLite.`)
        return true
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Gagal menyimpan OLT.")
        return false
      }
    },
    [commitState],
  )

  const removeOlt = useCallback(
    async (olt: Olt) => {
      const cur = stateRef.current
      await commitState({
        ...cur,
        olts: cur.olts.filter((i) => i.id !== olt.id),
        onus: cur.onus.filter((i) => i.oltId !== olt.id),
        alerts: cur.alerts.filter((i) => i.oltId !== olt.id),
      })
      toast.success(`${olt.name} beserta ONU & alert terkait dihapus.`)
    },
    [commitState],
  )

  const testConnection = useCallback(
    async (olt: Olt) => {
      toast.info(`Menghubungi ${olt.ipAddress}:${olt.snmpPort}...`)
      try {
        const res = await fetch("/api/snmp/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(olt),
        })
        const result = (await res.json()) as { ok: boolean; message: string; values?: Record<string, string> }
        const cur = stateRef.current
        await commitState({
          ...cur,
          olts: cur.olts.map((i) =>
            i.id === olt.id
              ? {
                  ...i,
                  status: result.ok ? "online" : "offline",
                  lastSeen: result.ok ? "Baru saja" : i.lastSeen,
                  uptime: result.values?.["1.3.6.1.2.1.1.3.0"] ?? i.uptime,
                  model: result.values?.["1.3.6.1.4.1.50224.3.1.1.19.0"] || result.values?.["1.3.6.1.4.1.37950.1.1.5.10.14.1.0"] || i.model,
                  location: result.values?.["1.3.6.1.2.1.1.6.0"] || i.location,
                  systemInfo: result.values ?? i.systemInfo,
                }
              : i,
          ),
        })
        if (result.ok) toast.success(result.message)
        else toast.error(result.message)
      } catch {
        toast.error("Gagal menghubungi endpoint test SNMP.")
      }
    },
    [commitState],
  )

  const testWrite = useCallback(async (olt: Olt) => {
    try {
      const res = await fetch("/api/snmp/test-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(olt),
      })
      const result = (await res.json()) as { ok: boolean; message: string }
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch {
      toast.error("Gagal menguji SNMP write.")
    }
  }, [])

  const pollOnu = useCallback(async (olt: Olt, opts: { silent?: boolean } = {}) => {
    if (pollingLocksRef.current.has(olt.id)) return
    pollingLocksRef.current.add(olt.id)
    if (!opts.silent) {
      setPollingOltId(olt.id)
      toast.info(`Polling ONU dari ${olt.name}...`)
    }
    try {
      const res = await fetch("/api/snmp/poll-onu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(olt),
      })
      const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
      if (result.state) setState(result.state)
      if (!opts.silent) {
        if (result.ok) toast.success(result.message)
        else toast.error(result.message)
      }
    } catch {
      if (!opts.silent) toast.error(`Polling ${olt.name} gagal diproses.`)
    } finally {
      pollingLocksRef.current.delete(olt.id)
      if (!opts.silent) setPollingOltId(null)
    }
  }, [])

  useEffect(() => {
    pollOnuRef.current = pollOnu
  }, [pollOnu])

  useEffect(() => {
    if (state.olts.length === 0) return
    const timers = state.olts.map((olt) => {
      const sec = Math.max(10, Number(olt.pollingInterval) || 60)
      return window.setInterval(() => void pollOnuRef.current(olt, { silent: true }), sec * 1000)
    })
    return () => timers.forEach((t) => window.clearInterval(t))
  }, [state.olts])

  const saveRename = useCallback(
    async (onu: Onu, nextName: string) => {
      const cur = stateRef.current
      const olt = cur.olts.find((i) => i.id === onu.oltId)
      if (!olt) return false
      try {
        const res = await fetch("/api/onu/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ olt, onu, nextName }),
        })
        const result = (await res.json()) as { ok: boolean; syncedToDevice: boolean; message: string }
        if (!result.ok) {
          toast.error(result.message)
          return false
        }
        await commitState({
          ...cur,
          onus: cur.onus.map((i) =>
            i.id === onu.id ? { ...i, name: nextName.trim(), syncStatus: result.syncedToDevice ? "synced" : "pending" } : i,
          ),
        })
        toast.success(result.message)
        return true
      } catch {
        toast.error("Gagal menyimpan nama ONU.")
        return false
      }
    },
    [commitState],
  )

  const clearAlerts = useCallback(
    async (mode: "acknowledged" | "all") => {
      const cur = stateRef.current
      const nextAlerts = mode === "acknowledged" ? cur.alerts.filter((a) => !a.acknowledged) : []
      await commitState({ ...cur, alerts: nextAlerts })
      toast.success("Riwayat alert dibersihkan.")
    },
    [commitState],
  )

  const resetDefault = useCallback(async () => {
    const res = await fetch("/api/monitoring/state", { method: "DELETE" })
    if (res.ok) {
      setState((await res.json()) as MonitoringState)
      toast.success("Database monitoring dikosongkan.")
    } else {
      toast.error("Gagal mereset database monitoring.")
    }
  }, [])

  const derived = useMemo(() => {
    const operationalAlerts = buildOperationalAlerts(state.olts, state.onus, state.alerts)
    const openAlertCount = operationalAlerts.filter((a) => !a.acknowledged).length
    const onlineOltCount = state.olts.filter((o) => o.status === "online").length
    const onlineOnuCount = state.onus.filter((o) => o.status === "online").length
    const downOnuCount = state.onus.filter((o) => o.status !== "online").length
    const mappedOnuCount = state.onus.filter((o) => o.latitude != null && o.longitude != null).length
    const weakRxCount = state.onus.filter((o) => o.status === "online" && o.rxPower !== 0 && o.rxPower <= -27).length
    const highTempCount = state.onus.filter((o) => o.status === "online" && o.temperatureC != null && o.temperatureC >= 55).length
    return {
      operationalAlerts,
      openAlertCount,
      onlineOltCount,
      onlineOnuCount,
      downOnuCount,
      mappedOnuCount,
      weakRxCount,
      highTempCount,
    }
  }, [state.olts, state.onus, state.alerts])

  const value = useMemo<MonitoringContextValue>(
    () => ({
      state,
      loading,
      notice,
      pollingOltId,
      locationDialogOnu,
      setLocationDialogOnu,
      ...derived,
      saveOnuLocation,
      bulkSaveOnuLocations,
      clearOnuLocation,
      saveMapSettings,
      saveOlt,
      removeOlt,
      testConnection,
      testWrite,
      pollOnu,
      saveRename,
      clearAlerts,
      resetDefault,
    }),
    [
      state,
      loading,
      notice,
      pollingOltId,
      locationDialogOnu,
      derived,
      saveOnuLocation,
      bulkSaveOnuLocations,
      clearOnuLocation,
      saveMapSettings,
      saveOlt,
      removeOlt,
      testConnection,
      testWrite,
      pollOnu,
      saveRename,
      clearAlerts,
      resetDefault,
    ],
  )

  return <MonitoringContext.Provider value={value}>{children}</MonitoringContext.Provider>
}

export function useMonitoring() {
  const ctx = useContext(MonitoringContext)
  if (!ctx) throw new Error("useMonitoring harus dipanggil di dalam MonitoringProvider")
  return ctx
}
