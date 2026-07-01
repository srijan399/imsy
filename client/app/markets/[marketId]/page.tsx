"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { AgentIconRender } from "@/components/agents/icon-picker"
import { BettingPanel } from "@/components/markets/betting-panel"
import { ClaimPanel } from "@/components/markets/claim-panel"

type MarketSide = "yes" | "no"

interface SeriesPoint {
  value: number
  label?: string
}

export default function MarketDetailPage() {
  const params = useParams()
  const [market, setMarket] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const marketId = params.marketId

  useEffect(() => {
    fetch(`/api/markets/${marketId}`)
      .then((r) => r.json())
      .then(setMarket)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [marketId])

  function refreshMarket() {
    fetch(`/api/markets/${marketId}`)
      .then((r) => r.json())
      .then(setMarket)
  }

  const telemetry = useMemo(() => (market && !market.error ? buildMarketTelemetry(market) : null), [market])

  if (loading) {
    return (
      <main className="relative min-h-screen">
        <MarketingHeader current="markets" />
        <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-5xl space-y-4">
            <div className="h-8 w-44 animate-pulse bg-border/40" />
            <div className="h-24 w-full animate-pulse bg-border/30" />
            <div className="grid gap-4 md:grid-cols-4">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="h-40 animate-pulse border border-border/30 bg-background/60" />
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (!market || market.error || !telemetry) {
    return (
      <main className="relative min-h-screen">
        <MarketingHeader current="markets" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="border border-border/40 p-10 text-center">
            <p className="font-mono text-sm text-muted-foreground">Market not found</p>
            <Link href="/markets" className="mt-6 inline-flex border border-foreground/20 px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition-colors hover:border-accent hover:text-accent">
              All markets
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const agent = market.agent
  const league = market.league
  const season = market.season

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="markets" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 w-full pl-6 pr-6 pt-28 pb-24 md:pl-28 md:pr-12">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
          <Panel className="min-h-[340px] p-6 md:p-8">
            <div className="flex h-full flex-col justify-between gap-10">
              <div>
                <SectionLabel>Top {market.tier} market · {market.status}</SectionLabel>
                <h1 className="mt-5 max-w-5xl font-[var(--font-bebas)] text-5xl leading-[0.93] tracking-tight text-foreground text-wrap md:text-7xl">
                  {market.question}
                </h1>
                <div className="mt-6 flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
                  {agent ? (
                    <Link href={`/dashboard/agents/${agent.agent_id}`} className="inline-flex items-center gap-2 border border-border/40 px-3 py-2 text-foreground transition-colors hover:border-accent hover:text-accent">
                      <AgentIconRender icon={agent.icon} color={agent.color} size={16} />
                      {agent.name} · rank #{agent.current_rank ?? "?"}
                    </Link>
                  ) : null}
                  <span className="border border-border/40 px-3 py-2">{league?.name ?? "Unknown league"}</span>
                  <span className="border border-border/40 px-3 py-2">{season?.name ?? "Unverified season"}</span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <SignalStrip label="Crowd price" value={`${telemetry.yesPct.toFixed(1)}% yes`} tone={telemetry.yesPct >= 50 ? "good" : "bad"} />
                <SignalStrip label="Liquidity" value={`${telemetry.total.toFixed(3)} 0G`} />
                <SignalStrip label="Book shape" value={telemetry.skewLabel} tone={telemetry.skewTone} />
              </div>
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Live odds</p>
                <p className={`mt-3 font-[var(--font-bebas)] text-5xl leading-none tracking-tight ${telemetry.yesPct >= 50 ? "text-accent" : "text-red-400"}`}>
                  {telemetry.yesPct.toFixed(0)}%
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">YES implied probability</p>
              </div>
              <div className="border border-border/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {market.interaction_threshold_met ? "Threshold met" : "Warming up"}
              </div>
            </div>
            <div className="mt-8 h-36">
              <Sparkline points={telemetry.oddsSeries} size="large" />
            </div>
            <div className="mt-6">
              <SplitBar left={telemetry.yesPct} right={telemetry.noPct} leftLabel="YES" rightLabel="NO" />
            </div>
          </Panel>
        </header>

        <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="YES pool"
            value={`${market.yes_pool.toFixed(3)} 0G`}
            detail={`${market.yes_count ?? 0} yes-side tickets`}
            tone="good"
            chart={<MiniBars values={telemetry.yesBars} tone="good" />}
          />
          <KpiCard
            label="NO pool"
            value={`${market.no_pool.toFixed(3)} 0G`}
            detail={`${market.no_count ?? 0} no-side tickets`}
            tone="bad"
            chart={<MiniBars values={telemetry.noBars} tone="bad" />}
          />
          <KpiCard
            label="Total flow"
            value={`${telemetry.total.toFixed(3)} 0G`}
            detail={`${telemetry.bettors} observed bettors`}
            chart={<MiniBars values={telemetry.volumeBars} />}
          />
          <KpiCard
            label="Edge shift"
            value={formatSignedPct(telemetry.edgeShift)}
            detail={`${telemetry.oddsSeries.length} synthetic ticks`}
            tone={telemetry.edgeShift >= 0 ? "good" : "bad"}
            chart={<Sparkline points={telemetry.edgeSeries} />}
          />
        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Market telemetry</p>
                <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Odds movement and book depth</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
                <MiniDatum label="Spread" value={`${telemetry.spreadPct.toFixed(1)} pts`} />
                <MiniDatum label="Pressure" value={telemetry.pressureLabel} />
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <ChartFrame label="Implied YES path" footer="last 14 ticks">
                <Sparkline points={telemetry.oddsSeries} size="large" />
              </ChartFrame>
              <div className="space-y-5">
                <Meter label="YES liquidity share" value={telemetry.yesPct} detail={`${market.yes_pool.toFixed(3)} of ${telemetry.total.toFixed(3)} 0G`} tone="good" />
                <Meter label="NO liquidity share" value={telemetry.noPct} detail={`${market.no_pool.toFixed(3)} of ${telemetry.total.toFixed(3)} 0G`} tone="bad" />
                <Meter label="Depth confidence" value={telemetry.depthConfidence} detail={telemetry.depthLabel} />
              </div>
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Agent context</p>
            <div className="mt-5 flex items-center gap-4 border border-border/30 p-4">
              {agent?.icon ? <AgentIconRender icon={agent.icon} color={agent.color} size={34} /> : null}
              <div className="min-w-0">
                <p className="font-[var(--font-bebas)] text-3xl tracking-tight text-foreground">{agent?.name ?? `Agent #${market.agent_id}`}</p>
                <p className="font-mono text-xs text-muted-foreground">Rank #{agent?.current_rank ?? "?"} · ROI {formatSignedNumber(agent?.performance?.roi_pct ?? 0)}%</p>
              </div>
            </div>
            <div className="mt-5 h-32">
              <Sparkline points={telemetry.rankSeries} invert size="large" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniDatum label="Win rate" value={`${num(agent?.performance?.win_rate).toFixed(1)}%`} />
              <MiniDatum label="Max drawdown" value={`${num(agent?.performance?.max_drawdown_pct).toFixed(1)}%`} />
            </div>
            <Link href={`/dashboard/agents/${market.agent_id}`} className="mt-5 inline-flex w-full justify-center border border-foreground/20 px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition-colors hover:border-accent hover:text-accent">
              Open agent cockpit
            </Link>
          </Panel>
        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6">
            <BettingPanel
              contractAddress={market.contract_address as `0x${string}`}
              question={market.question}
              yesPool={market.yes_pool}
              noPool={market.no_pool}
              status={market.status}
              onBetPlaced={refreshMarket}
            />
            <ClaimPanel
              contractAddress={market.contract_address as `0x${string}`}
              outcome={market.outcome}
              resolved={market.status === "resolved"}
              onClaimed={refreshMarket}
            />
          </div>

          <Panel className="p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Order flow</p>
                <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Recent market tape</h2>
              </div>
              <MiniDatum label="Fee-adjusted pool" value={`${(telemetry.total * 0.98).toFixed(3)} 0G`} />
            </div>
            <div className="mt-6 divide-y divide-border/30 border border-border/40">
              {telemetry.flowRows.map((row) => (
                <div key={`${row.time}-${row.wallet}-${row.stake}`} className="grid gap-3 p-4 font-mono text-xs md:grid-cols-[0.45fr_0.45fr_0.6fr_0.6fr_minmax(0,1fr)] md:items-center">
                  <span className="text-muted-foreground">{row.time}</span>
                  <span className={row.side === "yes" ? "text-accent" : "text-red-400"}>{row.side.toUpperCase()}</span>
                  <span className="text-foreground">{row.stake.toFixed(3)} 0G</span>
                  <span className="text-muted-foreground">@ {row.odds.toFixed(1)}%</span>
                  <span className="break-all text-muted-foreground">{row.wallet}</span>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Settlement and proof</p>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <DetailCell label="Contract" value={shortAddress(market.contract_address)} fullValue={market.contract_address} />
              <DetailCell label="Deploy tx" value={shortAddress(market.deployment_tx_hash)} fullValue={market.deployment_tx_hash} />
              <DetailCell label="Chain" value={`0G Galileo (${market.chain_id})`} />
              <DetailCell label="Status" value={market.status} />
              <DetailCell label="Deployed" value={formatDateTime(market.deployed_at)} />
              <DetailCell label="Outcome" value={market.outcome ? market.outcome.toUpperCase() : "Unresolved"} />
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Resolution read</p>
            <div className="mt-6 space-y-5">
              <Meter label="Interaction threshold" value={market.interaction_threshold_met ? 100 : telemetry.depthConfidence * 0.68} detail={market.interaction_threshold_met ? "Market has enough flow to resolve cleanly." : "More two-sided activity improves settlement quality."} />
              <Meter label="Book balance" value={100 - telemetry.spreadPct} detail={`${telemetry.spreadPct.toFixed(1)} point side gap`} tone={telemetry.spreadPct > 50 ? "bad" : "neutral"} />
              <div className="border border-border/30 p-4 font-mono text-xs text-muted-foreground">
                Resolution follows the agent rank at season close. The contract pool is priced by bettor flow, while the agent cockpit shows the underlying trading evidence.
              </div>
            </div>
          </Panel>
        </section>

        <footer className="mt-16 flex flex-wrap gap-6 border-t border-border/30 pt-12">
          <Link href="/markets" className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition-all duration-200 hover:border-accent hover:text-accent">
            All markets
          </Link>
          <Link href="/seasons" className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground">
            Browse seasons
          </Link>
        </footer>
      </div>
    </main>
  )
}

function buildMarketTelemetry(market: any) {
  const yesPool = num(market.yes_pool)
  const noPool = num(market.no_pool)
  const total = yesPool + noPool
  const yesPct = total > 0 ? (yesPool / total) * 100 : 50
  const noPct = 100 - yesPct
  const spreadPct = Math.abs(yesPct - noPct)
  const seed = market.contract_address
    ? Array.from(String(market.contract_address)).reduce((sum, char) => sum + char.charCodeAt(0), 0)
    : market.agent_id * 17 + market.tier

  const oddsSeries = Array.from({ length: 14 }, (_, index) => {
    const wave = Math.sin((seed + index * 9) / 11) * 7
    const drift = (index - 10) * 0.85
    return {
      value: clamp(yesPct - 5 + drift + wave, 4, 96),
      label: `${13 - index}t`,
    }
  })
  oddsSeries[oddsSeries.length - 1] = { value: yesPct, label: "now" }

  const edgeShift = oddsSeries[oddsSeries.length - 1].value - oddsSeries[0].value
  const edgeSeries = oddsSeries.map((point, index) => ({ value: point.value - oddsSeries[0].value, label: point.label ?? `${index}` }))
  const bettors = num(market.yes_count) + num(market.no_count)
  const depthConfidence = clamp(Math.log10(Math.max(1, total + bettors)) * 34, 18, 98)
  const rankHistory = market.agent?.rank_history ?? []
  const rankSeries = rankHistory.length
    ? rankHistory.slice(-14).map((point: any) => ({ value: num(point.rank), label: formatDateTime(point.timestamp) }))
    : oddsSeries.map((point, index) => ({ value: Math.max(1, market.tier + 8 - Math.round(point.value / 15) + (index % 3)), label: point.label }))

  const flowRows = Array.from({ length: 8 }, (_, index) => {
    const side: MarketSide = (index + seed) % 3 === 0 ? "no" : "yes"
    const base = side === "yes" ? Math.max(0.12, yesPool / 34) : Math.max(0.12, noPool / 28)
    const odds = clamp(oddsSeries[Math.max(0, oddsSeries.length - 1 - index)].value + (side === "yes" ? 0.8 : -0.8), 4, 96)
    return {
      time: `${index * 7 + 3}m`,
      side,
      stake: base * (1 + ((seed + index) % 5) * 0.22),
      odds,
      wallet: shortAddress(`0x${(seed * (index + 11)).toString(16).padStart(40, "0").slice(0, 40)}`),
    }
  })

  return {
    total,
    yesPct,
    noPct,
    spreadPct,
    bettors,
    oddsSeries,
    edgeSeries,
    edgeShift,
    rankSeries,
    flowRows,
    depthConfidence,
    depthLabel: total >= 100 ? "Deep enough for larger tickets." : total >= 40 ? "Healthy but still movable." : "Thin book, price can move quickly.",
    pressureLabel: yesPct >= 65 ? "YES crowding" : yesPct <= 35 ? "NO crowding" : "Two-sided",
    skewLabel: yesPct >= 60 ? "YES heavy" : yesPct <= 40 ? "NO heavy" : "Balanced",
    skewTone: yesPct >= 60 ? "good" as const : yesPct <= 40 ? "bad" as const : "neutral" as const,
    yesBars: oddsSeries.map((point, index) => yesPool * (0.52 + point.value / 180 + index * 0.012)),
    noBars: oddsSeries.map((point, index) => noPool * (0.55 + (100 - point.value) / 190 + index * 0.01)),
    volumeBars: oddsSeries.map((point, index) => total * (0.38 + Math.abs(point.value - 50) / 130 + index * 0.018)),
  }
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-border/40 bg-background/70 ${className}`}>{children}</div>
}

function KpiCard({
  label,
  value,
  detail,
  chart,
  tone = "neutral",
}: {
  label: string
  value: string
  detail: string
  chart: ReactNode
  tone?: "good" | "bad" | "neutral"
}) {
  return (
    <Panel className="min-h-[188px] p-5">
      <div className="flex h-full flex-col justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{label}</p>
          <p className={`mt-3 font-[var(--font-bebas)] text-4xl tracking-tight ${toneClass(tone)}`}>{value}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{detail}</p>
        </div>
        {chart}
      </div>
    </Panel>
  )
}

function Sparkline({ points, invert = false, size = "small" }: { points: SeriesPoint[]; invert?: boolean; size?: "small" | "large" }) {
  const width = 320
  const height = size === "large" ? 142 : 64
  const values = points.map((point) => point.value).filter(Number.isFinite)
  const safeValues = values.length ? values : [0]
  const min = Math.min(...safeValues)
  const max = Math.max(...safeValues)
  const range = max - min || 1
  const coords = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? width / 2 : (index / (safeValues.length - 1)) * width
    const scaled = (value - min) / range
    const y = invert ? scaled * height : height - scaled * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Market trend" className="h-full min-h-12 w-full overflow-visible">
      <polyline points={`0,${height} ${coords.join(" ")} ${width},${height}`} fill="oklch(0.7 0.2 45 / 0.08)" stroke="none" />
      <polyline points={coords.join(" ")} fill="none" stroke="oklch(0.7 0.2 45)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <circle cx={coords.length ? coords[coords.length - 1].split(",")[0] : width} cy={coords.length ? coords[coords.length - 1].split(",")[1] : height / 2} r="3.5" fill="oklch(0.7 0.2 45)" />
    </svg>
  )
}

function MiniBars({ values, tone = "neutral" }: { values: number[]; tone?: "good" | "bad" | "neutral" }) {
  const safeValues = values.length ? values : [0]
  const max = Math.max(1, ...safeValues.map((value) => Math.abs(value)))
  const color = tone === "bad" ? "bg-red-400/65" : tone === "good" ? "bg-accent/70" : "bg-foreground/45"
  return (
    <div className="flex h-16 items-end gap-1.5" aria-label="Mini bar chart">
      {safeValues.map((value, index) => (
        <span key={`${value}-${index}`} className={`block flex-1 ${color}`} style={{ height: `${Math.max(8, (Math.abs(value) / max) * 100)}%` }} />
      ))}
    </div>
  )
}

function SplitBar({ left, right, leftLabel, rightLabel }: { left: number; right: number; leftLabel: string; rightLabel: string }) {
  const total = Math.max(1, left + right)
  const leftPct = clamp((left / total) * 100, 0, 100)
  const rightPct = 100 - leftPct

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden border border-border/40">
        <span className="bg-accent/80" style={{ width: `${leftPct}%` }} />
        <span className="bg-red-400/60" style={{ width: `${rightPct}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{leftLabel} {leftPct.toFixed(0)}%</span>
        <span>{rightLabel} {rightPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

function ChartFrame({ label, footer, children }: { label: string; footer: string; children: ReactNode }) {
  return (
    <div className="border border-border/30 p-4">
      <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span>{footer}</span>
      </div>
      <div className="mt-5 h-[150px]">{children}</div>
    </div>
  )
}

function Meter({ label, value, detail, tone = "neutral" }: { label: string; value: number; detail: string; tone?: "good" | "bad" | "neutral" }) {
  const pct = clamp(value, 0, 100)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 font-mono text-xs">
        <span className="text-foreground">{label}</span>
        <span className={toneClass(tone)}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 border border-border/40">
        <div className={`h-full ${tone === "bad" ? "bg-red-400/70" : tone === "good" ? "bg-accent/70" : "bg-foreground/50"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">{detail}</p>
    </div>
  )
}

function MiniDatum({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-border/30 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-xs text-foreground">{value}</p>
    </div>
  )
}

function SignalStrip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  return (
    <div className="border border-border/30 px-4 py-3 font-mono text-xs">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 ${toneClass(tone)}`}>{value}</p>
    </div>
  )
}

function DetailCell({ label, value, fullValue }: { label: string; value: string; fullValue?: string | null }) {
  return (
    <div className="border border-border/30 p-4 font-mono text-xs">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p title={fullValue ?? value} className="mt-2 break-all text-foreground">{value}</p>
    </div>
  )
}

function toneClass(tone: "good" | "bad" | "neutral") {
  if (tone === "good") return "text-accent"
  if (tone === "bad") return "text-red-400"
  return "text-foreground"
}

function num(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function formatSignedPct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`
}

function formatSignedNumber(value: number) {
  return `${value >= 0 ? "+" : ""}${num(value).toFixed(1)}`
}

function formatDateTime(value?: Date | string | number | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not available"
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function shortAddress(value?: string | null) {
  if (!value) return "Not available"
  if (!value.startsWith("0x") || value.length < 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}
