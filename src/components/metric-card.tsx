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
    <CardContent className="relative flex h-full flex-col justify-between p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          {Icon && (
            <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl border shadow-sm sm:h-10 sm:w-10", style.iconWrap)}>
              <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </div>
          )}
          <p className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground sm:text-xs">{label}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {badge && (
            <Badge variant={badgeVariant} className="px-1.5 py-0.5 text-[10px] font-semibold tabular-nums sm:px-2 sm:text-[11px]">
              {badge}
            </Badge>
          )}
          {href && (
            <ArrowUpRight className="hidden h-4 w-4 text-muted-foreground/70 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
          )}
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-1 sm:mt-4 sm:gap-1.5">
        <span className="cn-font-heading text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</span>
        {subValue && <span className="text-sm font-semibold text-muted-foreground tabular-nums sm:text-base">{subValue}</span>}
      </div>

      <div className="mt-2.5 space-y-2 sm:mt-3 sm:space-y-2.5">
        {progress !== undefined && (
          <Progress value={progress} className="h-1.5 bg-secondary/80" indicatorClassName={style.indicator} />
        )}
        <p className="truncate border-t border-border/50 pt-2 text-[11px] text-muted-foreground sm:pt-2.5 sm:text-xs">{detail}</p>
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
