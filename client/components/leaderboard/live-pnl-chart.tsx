"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AgentIconRender } from "@/components/agents/icon-picker"

interface SeriesPoint {
  ts: string
  pnl_pct: number
  total_value_usd: string
}

interface AgentSeries {
  agent_id: number
  name: string
  icon: string
  color: string
  points: SeriesPoint[]
}

interface PnlHistoryResponse {
  league_id: string
  since: string
  series: AgentSeries[]
}

interface ChartPoint {
  ts: number
  [agentKey: string]: number
}

const POLL_MS = 10_000

function makeEndDot(icon: string, color: string, lastTs: number) {
  return function EndDot(props: any) {
    if (!props?.payload || props.payload.ts !== lastTs) return <g />
    return (
      <g key={`end-dot-${props.index}`}>
        <circle cx={props.cx} cy={props.cy} r={13} fill="#000" stroke={color} strokeWidth={2} />
        <foreignObject x={props.cx - 10} y={props.cy - 10} width={20} height={20}>
          {/* @ts-ignore */}
          <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20 }}>
            <AgentIconRender icon={icon} color={color} size={12} />
          </div>
        </foreignObject>
      </g>
    )
  }
}

function formatPct(value: number) {
  if (value === 0) return "0.00%"
  const sign = value > 0 ? "+" : ""
  if (Math.abs(value) < 0.01) return `${sign}<0.01%`
  return `${sign}${value.toFixed(2)}%`
}

export function LivePnlChart({ leagueId, windowMs = 60 * 60 * 1000 }: { leagueId: string; windowMs?: number }) {
  const [data, setData] = useState<PnlHistoryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function tick() {
      try {
        const since = new Date(Date.now() - windowMs).toISOString()
        const res = await fetch(`/api/leagues/${leagueId}/pnl-history?since=${since}`, { cache: "no-store" })
        const body = await res.json()
        if (!cancelled) {
          if (!res.ok) {
            setError(body.error ?? "Failed to load PnL history")
          } else {
            setError(null)
            setData(body)
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [leagueId, windowMs])

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data) return []
    const tsBuckets = new Map<number, ChartPoint>()
    for (const series of data.series) {
      for (const point of series.points) {
        const ts = new Date(point.ts).getTime()
        const existing = tsBuckets.get(ts) ?? { ts }
        existing[`agent_${series.agent_id}`] = point.pnl_pct
        tsBuckets.set(ts, existing)
      }
    }
    return Array.from(tsBuckets.values()).sort((a, b) => a.ts - b.ts)
  }, [data])

  if (error) {
    return (
      <div className="border border-red-500/40 p-6 font-mono text-xs text-red-400">
        Chart error: {error}
      </div>
    )
  }

  if (!data || data.series.length === 0 || chartData.length === 0) {
    return (
      <div className="border border-border/40 p-6 font-mono text-xs text-muted-foreground">
        No snapshots yet. Run an engine tick or reprice tick to populate the chart.
      </div>
    )
  }

  return (
    <div className="border border-border/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Live PnL</p>
        <p className="font-mono text-[10px] text-muted-foreground/60">
          {data.series.length} agents · {chartData.length} samples · since {new Date(data.since).toLocaleTimeString()}
        </p>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer>
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              {data.series.map((s) => (
                <linearGradient key={s.agent_id} id={`pnl-gradient-${s.agent_id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                  <stop offset="55%" stopColor={s.color} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.01} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              stroke="rgba(255,255,255,0.4)"
              fontSize={10}
            />
            <YAxis
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              stroke="rgba(255,255,255,0.4)"
              fontSize={10}
              domain={["dataMin - 5", "dataMax + 5"]}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.6)" strokeDasharray="4 4" />
            <Tooltip
              contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", fontSize: 11 }}
              labelFormatter={(v) => new Date(v as number).toLocaleString()}
              formatter={(value: number, key: string) => {
                const id = Number(key.replace("agent_", ""))
                const series = data.series.find((s) => s.agent_id === id)
                const label = series?.name ?? key
                return [formatPct(value), label]
              }}
            />
            <Legend
              content={() => (
                <div className="flex flex-wrap gap-3 mt-3 font-mono text-[10px]">
                  {data.series.map((s) => {
                    const last = s.points[s.points.length - 1]
                    return (
                      <span
                        key={s.agent_id}
                        className="inline-flex items-center gap-1.5 border border-border/30 px-2 py-1"
                      >
                        <AgentIconRender icon={s.icon} color={s.color} size={14} />
                        <span style={{ color: s.color }}>{s.name}</span>
                        <span className={last && last.pnl_pct >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {last ? formatPct(last.pnl_pct) : "—"}
                        </span>
                      </span>
                    )
                  })}
                </div>
              )}
            />
            {data.series.map((s) => {
              const lastTs = s.points.length > 0 ? new Date(s.points[s.points.length - 1].ts).getTime() : 0
              return (
                <Area
                  key={s.agent_id}
                  type="monotone"
                  dataKey={`agent_${s.agent_id}`}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#pnl-gradient-${s.agent_id})`}
                  fillOpacity={1}
                  dot={makeEndDot(s.icon, s.color, lastTs)}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={true}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
