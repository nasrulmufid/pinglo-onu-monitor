import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { AlertSeverity, OltStatus, Onu } from "@shared/types"

type StatusValue = OltStatus | Onu["status"] | AlertSeverity | Onu["syncStatus"]

const statusConfig: Record<
  StatusValue,
  { label: string; variant: "success" | "destructive" | "warning" | "info" | "secondary"; dotClass: string }
> = {
  online: { label: "Online", variant: "success", dotClass: "bg-emerald-500" },
  synced: { label: "Synced", variant: "success", dotClass: "bg-emerald-500" },
  critical: { label: "Critical", variant: "destructive", dotClass: "bg-red-500" },
  los: { label: "LOS", variant: "destructive", dotClass: "bg-red-500" },
  failed: { label: "Failed", variant: "destructive", dotClass: "bg-red-500" },
  warning: { label: "Warning", variant: "warning", dotClass: "bg-amber-500" },
  degraded: { label: "Degraded", variant: "warning", dotClass: "bg-amber-500" },
  pending: { label: "Pending", variant: "warning", dotClass: "bg-amber-500" },
  info: { label: "Info", variant: "info", dotClass: "bg-sky-500" },
  offline: { label: "Offline", variant: "secondary", dotClass: "bg-rose-500" },
  "local-only": { label: "Local Only", variant: "secondary", dotClass: "bg-slate-400 dark:bg-slate-500" },
}

export function StatusBadge({ value, className }: { value: StatusValue; className?: string }) {
  const cfg = statusConfig[value] ?? { label: value, variant: "secondary" as const, dotClass: "bg-slate-400" }
  return (
    <Badge variant={cfg.variant} className={cn("gap-1.5 font-medium", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cfg.dotClass)} />
      {cfg.label}
    </Badge>
  )
}
