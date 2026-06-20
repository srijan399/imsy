"use client"

import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string | number
  suffix?: string
  trend?: "up" | "down" | "neutral"
  className?: string
}

export function StatCard({ label, value, suffix, trend, className }: StatCardProps) {
  return (
    <div className={cn("border border-border/40 p-5 space-y-2", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-[var(--font-bebas)] text-3xl md:text-4xl tracking-tight",
            trend === "up" && "text-emerald-400",
            trend === "down" && "text-red-400",
            !trend && "text-foreground",
          )}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {suffix && (
          <span className="font-mono text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  )
}
