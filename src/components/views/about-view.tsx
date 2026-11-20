import { Cpu, Database, Layers, Map, Network, Radio, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const supportedVendors = [
  { name: "VSOL GPON", profile: "vsol-gpon", desc: "Pembacaan status ONT, serial, suhu, TX/RX power, dan alasan down." },
  { name: "HSGQ GPON", profile: "hsgq-gpon", desc: "Support polling telemetri penuh serta SNMP write untuk rename ONT." },
  { name: "HSGQ EPON", profile: "hsgq-epon", desc: "Pemantauan ONU EPON, RX optical power, suhu, dan status operasi." },
  { name: "Generic SNMP", profile: "generic", desc: "MIB-II standar untuk perangkat OLT/router berbasis SNMP v1/v2c." },
]

const stackItems = [
  { icon: Layers, name: "React 18 + TypeScript", detail: "Antarmuka SPA cepat dengan strict typing." },
  { icon: Cpu, name: "Vite 6 + Tailwind CSS", detail: "Build ringkas dengan utility styling modern." },
  { icon: ShieldCheck, name: "shadcn/ui + Radix UI", detail: "Komponen aksesibel, konsisten, dan dark-mode ready." },
  { icon: Map, name: "Leaflet + React Leaflet", detail: "Peta interaktif OpenStreetMap & citra Satelit." },
  { icon: Radio, name: "net-snmp Collector", detail: "Polling periodik non-blocking langsung ke OLT." },
  { icon: Database, name: "node:sqlite Lokal", detail: "Database terintegrasi bawaan Node.js tanpa server terpisah." },
]

export function AboutView() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 via-emerald-400 to-sky-500 text-slate-950 shadow-sm">
              <Network className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">PingLo</CardTitle>
                <Badge variant="info">v1.1.0</Badge>
                <Badge variant="success">SQLite + Map Edition</Badge>
              </div>
              <CardDescription className="mt-1">
                OLT &amp; ONU Operations Center — Pemantauan Jaringan Optik &amp; Pemetaan Geografis
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Aplikasi monitoring SNMP OLT &amp; ONU/ONT yang dirancang khusus untuk tim NOC dan teknisi lapangan ISP. Dilengkapi pemetaan titik lokasi perangkat ONU berbasis Leaflet (OpenStreetMap &amp; Satelit), deteksi sinyal lemah, alert otomatis, serta manajemen akses berbasis role dengan penyimpanan SQLite lokal bawaan Node.js.
          </p>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Vendor &amp; Profil OID yang Didukung</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {supportedVendors.map((v) => (
                <div key={v.profile} className="rounded-xl border bg-muted/25 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{v.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {v.profile}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Arsitektur &amp; Teknologi</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stackItems.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.name} className="flex items-start gap-3 rounded-xl border p-3.5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{item.name}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
