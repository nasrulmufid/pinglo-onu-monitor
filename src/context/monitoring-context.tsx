import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/context/auth-context"
import { apiFetch } from "@/lib/api"
import { buildOperationalAlerts, emptyState, type OltForm } from "@/lib/monitoring-utils"
import type { Alert, BulkOnuLocationItem, BulkOnuLocationResult, MapSettings, MonitoringState, Olt, Onu } from "@shared/types"

type MonitoringContextValue = {
  state: MonitoringState
  loading: boolean
  notice: string
  pollingOltId: string | null
  locationDialogOnu: Onu | null
  setLocationDialogOnu: (onu: Onu | null) => void
  viewLocationDialogOnu: Onu | null
  setViewLocationDialogOnu: (onu: Onu | null) => void
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
  const { session, authLoading } = useAuth()
  const [state, setState] = useState<MonitoringState>(emptyState)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("Memuat database SQLite...")
  const [pollingOltId, setPollingOltId] = useState<string | null>(null)
  const [locationDialogOnu, setLocationDialogOnu] = useState<Onu | null>(null)
  const [viewLocationDialogOnu, setViewLocationDialogOnu] = useState<Onu | null>(null)

  const stateRef = useRef(state)
  const pollingLocksRef = useRef(new Set<string>())
  const pollOnuRef = useRef<(olt: Olt, opts?: { silent?: boolean }) => Promise<void>>(async () => undefined)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (authLoading || !session) {
      if (!authLoading && !session) {
        setState(emptyState)
        setLoading(false)
      }
      return
    }
    let active = true
    setLoading(true)
    apiFetch("/api/monitoring/state")
      .then(async (r) => {
        if (!r.ok) throw new Error("Gagal memuat database.")
        return (await r.json()) as MonitoringState
      })
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
  }, [authLoading, session])

  const saveOnuLocation = useCallback(async (onuId: string, latitude: number, longitude: number, locationNote: string) => {
    const res = await apiFetch(`/api/onu/${encodeURIComponent(onuId)}/location`, {
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
      const res = await apiFetch("/api/onus/locations/bulk", {
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
    const res = await apiFetch(`/api/onu/${encodeURIComponent(onuId)}/location`, { method: "DELETE" })
    const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
    if (result.state) setState(result.state)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [])

  const saveMapSettings = useCallback(async (nextMap: MapSettings) => {
    const res = await apiFetch("/api/settings/map", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextMap),
    })
    const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
    if (result.state) setState(result.state)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }, [])

  const saveOlt = useCallback(async (form: OltForm, editingOltId: string | null) => {
    const name = form.name.trim()
    const ipAddress = form.ipAddress.trim()
    const readCommunity = form.readCommunity.trim()
    const existingOlt = editingOltId ? stateRef.current.olts.find((o) => o.id === editingOltId) : null

    if (!name || !ipAddress) {
      toast.error("Nama OLT dan IP/Host wajib diisi.")
      return false
    }
    if (!readCommunity && !(editingOltId && existingOlt?.hasReadCommunity)) {
      toast.error("Read Community wajib diisi.")
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
      const url = editingOltId ? `/api/olts/${encodeURIComponent(editingOltId)}` : "/api/olts"
      const method = editingOltId ? "PUT" : "POST"
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
      if (!result.ok) {
        toast.error(result.message)
        return false
      }
      if (result.state) setState(result.state)
      toast.success(result.message)
      return true
    } catch {
      toast.error("Gagal menyimpan OLT ke server.")
      return false
    }
  }, [])

  const removeOlt = useCallback(async (olt: Olt) => {
    try {
      const res = await apiFetch(`/api/olts/${encodeURIComponent(olt.id)}`, { method: "DELETE" })
      const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
      if (result.state) setState(result.state)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch {
      toast.error("Gagal menghapus OLT.")
    }
  }, [])

  const testConnection = useCallback(async (olt: Olt) => {
    toast.info(`Menghubungi ${olt.ipAddress}:${olt.snmpPort}...`)
    try {
      const res = await apiFetch("/api/snmp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oltId: olt.id }),
      })
      const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
      if (result.state) setState(result.state)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch {
      toast.error("Gagal menghubungi endpoint test SNMP.")
    }
  }, [])

  const testWrite = useCallback(async (olt: Olt) => {
    try {
      const res = await apiFetch("/api/snmp/test-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oltId: olt.id }),
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
      const res = await apiFetch("/api/snmp/poll-onu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oltId: olt.id }),
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
    if (!session || state.olts.length === 0) return
    const timers = state.olts.map((olt) => {
      const sec = Math.max(10, Number(olt.pollingInterval) || 60)
      return window.setInterval(() => void pollOnuRef.current(olt, { silent: true }), sec * 1000)
    })
    return () => timers.forEach((t) => window.clearInterval(t))
  }, [session, state.olts])

  const saveRename = useCallback(async (onu: Onu, nextName: string) => {
    try {
      const res = await apiFetch("/api/onu/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oltId: onu.oltId, onuId: onu.id, nextName }),
      })
      const result = (await res.json()) as { ok: boolean; message: string; state?: MonitoringState }
      if (!result.ok) {
        toast.error(result.message)
        return false
      }
      if (result.state) setState(result.state)
      toast.success(result.message)
      return true
    } catch {
      toast.error("Gagal menyimpan nama ONU.")
      return false
    }
  }, [])

  const clearAlerts = useCallback(async (mode: "acknowledged" | "all") => {
    try {
      const res = await apiFetch(`/api/alerts?mode=${encodeURIComponent(mode)}`, { method: "DELETE" })
      const result = (await res.json()) as { ok: boolean; message?: string; state?: MonitoringState }
      if (!res.ok || !result.ok) {
        toast.error(result.message ?? "Gagal membersihkan riwayat alert.")
        return
      }
      if (result.state) setState(result.state)
      toast.success("Riwayat alert dibersihkan.")
    } catch {
      toast.error("Gagal membersihkan riwayat alert.")
    }
  }, [])

  const resetDefault = useCallback(async () => {
    const res = await apiFetch("/api/monitoring/state", { method: "DELETE" })
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
      viewLocationDialogOnu,
      setViewLocationDialogOnu,
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
      viewLocationDialogOnu,
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
