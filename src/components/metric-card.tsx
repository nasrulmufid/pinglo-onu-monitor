import { Link } from "react-router-dom"
import { ArrowUpRight, type LucideIcon } from "lucide-react"

import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type MetricCardProps = {
  label: string
  value: string
  subValue?: string
  detail: string
  tone?: "cyan" | "emerald" | "amber" | "red"
  icon?: LucideIcon
  progress?: number
  badge?: string
  badgeVariant?: BadgeProps["variant"]
  href?: string
}

const tones = {
  cyan: {
    hoverBorder: "hover:ring-cyan-500/35",
    glow: "bg-cyan-500",
    iconWrap: "border-cyan-500/25 bg-gradient-to-br from-cyan-500/15 to-sky-500/5 text-cyan-600 dark:text-cyan-400",
    indicator: "bg-cyan-500",
  },
  emerald: {
    hoverBorder: "hover:ring-emerald-500/35",
    glow: "bg-emerald-500",
    iconWrap: "border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 to-teal-500/5 text-emerald-600 dark:text-emerald-400",
    indicator: "bg-emerald-500",
  },
  amber: {
    hoverBorder: "hover:ring-amber-500/35",
    glow: "bg-amber-500",
    iconWrap: "border-amber-500/25 bg-gradient-to-br from-amber-500/15 to-orange-500/5 text-amber-600 dark:text-amber-400",
    indicator: "bg-amber-500",
  },
  red: {
    hoverBorder: "hover:ring-rose-500/35",
    glow: "bg-rose-500",
    iconWrap: "border-rose-500/25 bg-gradient-to-br from-rose-500/15 to-red-500/5 text-rose-600 dark:text-rose-400",
    indicator: "bg-rose-500",
  },
}

export function MetricCard({
  label,
  value,
  subValue,
  detail,
  tone = "cyan",
  icon: Icon,
  progress,
  badge,
  badgeVariant = "secondary",
  href,
}: MetricCardProps) {
  const style = tones[tone]

  const inner = (
    <CardContent className="relative flex h-full flex-col justify-between p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border shadow-sm", style.iconWrap)}>
              <Icon className="h-[18px] w-[18px]" />
            </div>
          )}
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground">{label}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {badge && (
            <Badge variant={badgeVariant} className="px-2 py-0.5 text-[11px] font-semibold tabular-nums">
              {badge}
            </Badge>
          )}
          {href && (
            <ArrowUpRight className="h-4 w-4 text-muted-foreground/70 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="cn-font-heading text-3xl font-bold tracking-tight tabular-nums">{value}</span>
        {subValue && <span className="text-base font-semibold text-muted-foreground tabular-nums">{subValue}</span>}
      </div>

      <div className="mt-3 space-y-2.5">
        {progress !== undefined && (
          <Progress value={progress} className="h-1.5 bg-secondary/80" indicatorClassName={style.indicator} />
        )}
        <p className="truncate border-t border-border/50 pt-2.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </CardContent>
  )

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-[min(var(--radius-4xl),24px)] bg-gradient-to-b from-card to-card/75 ring-1 ring-foreground/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring dark:ring-foreground/10",
        style.hoverBorder,
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-30",
          style.glow,
        )}
      />
      {href ? (
        <Link to={href} className="block h-full focus-visible:outline-none">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </Card>
  )
}
