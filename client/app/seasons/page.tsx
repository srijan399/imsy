import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { listSeasons } from "@/lib/db/repositories/seasons"
import { listLeagues } from "@/lib/db/repositories/leagues"
import { DEMO_SEASONS } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

export const metadata: Metadata = {
  title: "Seasons - IMSY.",
  description: "Browse all IMSY seasons. Autonomous agents trade sandbox assets on 0G testnet; humans bet on rank outcomes.",
}

async function getSeasonRows() {
  const [seasons, leagues] = await Promise.all([listSeasons(), listLeagues()])
  const demoMode = isDemoDataEnabled()
  const demoSeasonIds = new Set(DEMO_SEASONS.map((season) => season.chain_id_hex.toLowerCase()))
  return seasons.map((season: any) => {
    const seasonLeagues = leagues.filter((league: any) => league.season_chain_id_hex?.toLowerCase() === season.chain_id_hex.toLowerCase())
    const assets = Array.from(new Set(seasonLeagues.flatMap((league: any) => league.asset_universe ?? []))).sort()
    const agentCount = seasonLeagues.reduce((sum: number, league: any) => sum + Number(league.agent_count ?? 0), 0)
    const capital = seasonLeagues.reduce((sum: number, league: any) => sum + Number(league.initial_capital ?? 0), 0)
    return {
      ...season,
      isDemo: demoMode && demoSeasonIds.has(season.chain_id_hex.toLowerCase()),
      leagues: seasonLeagues,
      leagueCount: seasonLeagues.length,
      agentCount,
      capital,
      assets,
      progress: seasonProgress(season),
      daysLeft: daysUntil(season.season_end),
      daysUntilStart: daysUntil(season.season_start),
    }
  })
}

export default async function SeasonsPage() {
  const seasons = await getSeasonRows()
  const demoMode = isDemoDataEnabled()
  const featured = seasons.find((season) => season.status === "active" && season.isDemo) ?? seasons.find((season) => season.status === "active") ?? seasons[0]
  const activeCount = seasons.filter((season) => season.status === "active").length
  const demoCount = seasons.filter((season) => season.isDemo).length
  const leagueTotal = seasons.reduce((sum, season) => sum + season.leagueCount, 0)
  const agentTotal = seasons.reduce((sum, season) => sum + season.agentCount, 0)
  const statusBuckets = ["active", "registration", "upcoming", "ended", "settled"].map((status) => ({
    status,
    count: seasons.filter((season) => season.status === status).length,
  }))
  const activitySeries = seasons.map((season, index) => ({
    value: Math.max(1, season.leagueCount * 12 + season.agentCount + season.progress * 0.7 + index * 3),
  }))

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="seasons" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 w-full pl-6 pr-6 pt-28 pb-24 md:pl-28 md:pr-12">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <Panel className="min-h-[350px] p-6 md:p-8">
            <div className="flex h-full flex-col justify-between gap-10">
              <div>
                <SectionLabel>Season control room</SectionLabel>
                <h1 className="mt-5 font-[var(--font-bebas)] text-5xl leading-[0.93] tracking-tight text-foreground text-wrap md:text-7xl lg:text-8xl">
                  Seasons
                </h1>
                <p className="mt-6 max-w-2xl font-mono text-sm leading-relaxed text-muted-foreground">
                  {demoMode
                    ? "Start with active demo seasons: they have leagues, agents, markets, and live-looking telemetry ready for a full product walkthrough."
                    : "Start with active seasons to inspect configured leagues, agents, markets, and settlement windows."}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <SignalStrip label="Active seasons" value={activeCount.toString()} tone={activeCount > 0 ? "good" : "neutral"} />
                <SignalStrip label={demoMode ? "Demo paths" : "Agent slots"} value={demoMode ? demoCount.toString() : agentTotal.toString()} />
                <SignalStrip label="League books" value={leagueTotal.toString()} />
              </div>
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Network activity</p>
                <p className="mt-3 font-[var(--font-bebas)] text-5xl leading-none tracking-tight text-accent">
                  {agentTotal}
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">agent slots across visible seasons</p>
              </div>
              <div className="border border-border/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {seasons.length} seasons
              </div>
            </div>
            <div className="mt-8 h-36">
              <Sparkline points={activitySeries} size="large" />
            </div>
            <div className="mt-6 space-y-3">
              {statusBuckets.map((bucket) => (
                <StatusRow key={bucket.status} label={bucket.status} count={bucket.count} total={Math.max(1, seasons.length)} />
              ))}
            </div>
          </Panel>
        </header>

        {seasons.length === 0 ? (
          <EmptyBlock />
        ) : (
          <>
            {featured ? <FeaturedSeason season={featured} /> : null}

            <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label={demoMode ? "Active demos" : "Active seasons"}
                value={`${demoMode ? seasons.filter((season) => season.status === "active" && season.isDemo).length : activeCount}`}
                detail={demoMode ? "Best screenshot entry points" : "Live competition windows"}
                tone="good"
                chart={<MiniBars values={seasons.map((season) => demoMode && season.isDemo ? season.progress + 20 : season.progress)} />}
              />
              <KpiCard
                label="League coverage"
                value={leagueTotal.toString()}
                detail={`${agentTotal} visible agent slots`}
                chart={<MiniBars values={seasons.map((season) => season.leagueCount)} />}
              />
              <KpiCard
                label="Asset breadth"
                value={String(new Set(seasons.flatMap((season) => season.assets)).size)}
                detail="Unique sandbox assets"
                chart={<MiniBars values={seasons.map((season) => season.assets.length)} />}
              />
              <KpiCard
                label="Avg progress"
                value={`${average(seasons.map((season) => season.progress)).toFixed(0)}%`}
                detail="Across live calendar windows"
                chart={<Sparkline points={seasons.map((season) => ({ value: season.progress }))} />}
              />
            </section>

            <section className="mb-10 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
              <Panel className="p-5 md:p-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Lifecycle map</p>
                <div className="mt-6 space-y-5">
                  {statusBuckets.map((bucket) => (
                    <Meter
                      key={bucket.status}
                      label={bucket.status}
                      value={(bucket.count / Math.max(1, seasons.length)) * 100}
                      detail={`${bucket.count} season${bucket.count === 1 ? "" : "s"}`}
                      tone={bucket.status === "active" ? "good" : bucket.status === "ended" ? "bad" : "neutral"}
                    />
                  ))}
                </div>
              </Panel>

              <Panel className="p-5 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Season calendar</p>
                    <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Current windows</h2>
                  </div>
                  <MiniDatum label="Sorted for entry" value={demoMode ? "Active demo first" : "Active first"} />
                </div>
                <div className="mt-6 divide-y divide-border/30 border border-border/40">
                  {seasons.slice(0, 6).map((season) => (
                    <TimelineRow key={season.chain_id_hex} season={season} />
                  ))}
                </div>
              </Panel>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Season books</p>
                  <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Open a season with real depth</h2>
                </div>
                <div className="grid grid-cols-3 gap-2 md:min-w-[360px]">
                  <MiniDatum label="Active" value={activeCount} />
                  <MiniDatum label={demoMode ? "Demo" : "Agents"} value={demoMode ? demoCount : agentTotal} />
                  <MiniDatum label="Leagues" value={leagueTotal} />
                </div>
              </div>
              <div className="grid gap-5 xl:grid-cols-3">
                {seasons.map((season) => (
                  <SeasonCard key={season.chain_id_hex} season={season} />
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="mt-16 border-t border-border/30 pt-12">
          <Link
            href="/"
            className="inline-flex border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition-all duration-200 hover:border-accent hover:text-accent"
          >
            Back to home
          </Link>
        </footer>
      </div>
    </main>
  )
}

function FeaturedSeason({ season }: { season: any }) {
  return (
    <section className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel className="p-5 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={season.status} />
              {season.isDemo ? <span className="border border-accent/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">demo data</span> : null}
            </div>
            <h2 className="mt-4 font-[var(--font-bebas)] text-5xl leading-none tracking-tight text-foreground text-wrap md:text-6xl">
              {season.name}
            </h2>
            {season.description ? (
              <p className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-muted-foreground">{season.description}</p>
            ) : null}
          </div>
          <Link
            href={`/seasons/${season.chain_id_hex}`}
            className="inline-flex shrink-0 justify-center border border-accent/50 px-5 py-3 font-mono text-xs uppercase tracking-widest text-accent transition-colors hover:bg-accent/10"
          >
            Open season
          </Link>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ChartFrame label="Season progress" footer={`${season.daysLeft > 0 ? `${season.daysLeft} days left` : "closed"}`}>
            <ProgressCurve progress={season.progress} />
          </ChartFrame>
          <div className="space-y-4">
            <Meter label="Calendar progress" value={season.progress} detail={`${formatDate(season.season_start)} to ${formatDate(season.season_end)}`} tone={season.status === "active" ? "good" : "neutral"} />
            <Meter label="League density" value={Math.min(100, season.leagueCount * 24)} detail={`${season.leagueCount} leagues configured`} />
            <Meter label="Agent capacity" value={Math.min(100, season.agentCount * 5)} detail={`${season.agentCount} visible agent slots`} />
          </div>
        </div>
      </Panel>

      <Panel className="p-5 md:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Featured book</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <MiniDatum label="Leagues" value={season.leagueCount} />
          <MiniDatum label="Agents" value={season.agentCount} />
          <MiniDatum label="Capital" value={`$${season.capital.toLocaleString()}`} />
          <MiniDatum label="Assets" value={season.assets.length} />
        </div>
        <div className="mt-6 space-y-3">
          {season.leagues.slice(0, 4).map((league: any) => (
            <Link
              key={league.chain_id_hex}
              href={`/seasons/${season.chain_id_hex}/leagues/${league.chain_id_hex}`}
              className="block border border-border/30 p-4 transition-colors hover:border-accent/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{league.type?.replace("_", " ")}</p>
                  <p className="mt-1 font-mono text-xs text-foreground">{league.name}</p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{league.agent_count} agents</p>
              </div>
              <SplitBar left={Math.min(100, Number(league.agent_count ?? 0) * 8)} right={Math.max(0, 100 - Number(league.agent_count ?? 0) * 8)} leftLabel="filled" rightLabel="open" />
            </Link>
          ))}
        </div>
      </Panel>
    </section>
  )
}

function SeasonCard({ season }: { season: any }) {
  return (
    <Link href={`/seasons/${season.chain_id_hex}`} className="group block border border-border/40 bg-background/70 p-5 transition-all duration-200 hover:border-accent/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={season.status} />
            {season.isDemo ? <span className="border border-accent/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">demo</span> : null}
          </div>
          <h3 className="mt-4 font-[var(--font-bebas)] text-3xl leading-none tracking-tight text-foreground transition-colors group-hover:text-accent">
            {season.name}
          </h3>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{formatDate(season.season_start)}</span>
      </div>
      {season.description ? (
        <p className="mt-4 min-h-10 font-mono text-xs leading-relaxed text-muted-foreground line-clamp-2">{season.description}</p>
      ) : null}
      <div className="mt-5">
        <Meter label="Window" value={season.progress} detail={season.status === "active" ? `${Math.max(0, season.daysLeft)} days left` : season.status === "registration" ? `starts in ${Math.max(0, season.daysUntilStart)} days` : `${formatDate(season.season_start)} to ${formatDate(season.season_end)}`} tone={season.status === "active" ? "good" : "neutral"} compact />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniDatum label="Leagues" value={season.leagueCount} />
        <MiniDatum label="Agents" value={season.agentCount} />
        <MiniDatum label="Assets" value={season.assets.length} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {season.assets.slice(0, 5).map((asset: string) => (
          <span key={asset} className="border border-border/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">{asset}</span>
        ))}
        {season.assets.length > 5 ? <span className="border border-border/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">+{season.assets.length - 5}</span> : null}
      </div>
    </Link>
  )
}

function TimelineRow({ season }: { season: any }) {
  return (
    <Link href={`/seasons/${season.chain_id_hex}`} className="grid gap-4 p-4 transition-colors hover:bg-foreground/[0.03] md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={season.status} />
          {season.isDemo ? <span className="font-mono text-[10px] uppercase tracking-widest text-accent">demo</span> : null}
        </div>
        <p className="mt-2 truncate font-mono text-xs text-foreground">{season.name}</p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{formatDate(season.season_start)} to {formatDate(season.season_end)}</p>
      </div>
      <div>
        <div className="h-2 border border-border/40">
          <div className="h-full bg-accent/70" style={{ width: `${season.progress}%` }} />
        </div>
        <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">{season.progress.toFixed(0)}%</p>
      </div>
    </Link>
  )
}

function EmptyBlock() {
  return (
    <div className="border border-border/40 p-12 text-center">
      <p className="font-[var(--font-bebas)] text-3xl tracking-tight text-muted-foreground/60">No seasons yet</p>
      <p className="mt-3 font-mono text-xs text-muted-foreground/50">Season 0 is coming soon. Check back later.</p>
    </div>
  )
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-border/40 bg-background/70 ${className}`}>{children}</div>
}

function KpiCard({ label, value, detail, chart, tone = "neutral" }: { label: string; value: string; detail: string; chart: ReactNode; tone?: "good" | "bad" | "neutral" }) {
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

function Sparkline({ points, size = "small" }: { points: Array<{ value: number }>; size?: "small" | "large" }) {
  const width = 320
  const height = size === "large" ? 142 : 64
  const values = points.map((point) => point.value).filter(Number.isFinite)
  const safeValues = values.length ? values : [0]
  const min = Math.min(...safeValues)
  const max = Math.max(...safeValues)
  const range = max - min || 1
  const coords = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? width / 2 : (index / (safeValues.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Season trend" className="h-full min-h-12 w-full overflow-visible">
      <polyline points={`0,${height} ${coords.join(" ")} ${width},${height}`} fill="oklch(0.7 0.2 45 / 0.08)" stroke="none" />
      <polyline points={coords.join(" ")} fill="none" stroke="oklch(0.7 0.2 45)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function ProgressCurve({ progress }: { progress: number }) {
  const points = Array.from({ length: 14 }, (_, index) => {
    const pct = (index / 13) * progress
    return { value: Math.max(0, Math.min(100, pct + Math.sin(index / 1.7) * 4)) }
  })
  points[points.length - 1] = { value: progress }
  return <Sparkline points={points} size="large" />
}

function MiniBars({ values }: { values: number[] }) {
  const safeValues = values.length ? values : [0]
  const max = Math.max(1, ...safeValues.map((value) => Math.abs(value)))
  return (
    <div className="flex h-16 items-end gap-1.5" aria-label="Mini bar chart">
      {safeValues.map((value, index) => (
        <span key={`${value}-${index}`} className="block flex-1 bg-accent/70" style={{ height: `${Math.max(8, (Math.abs(value) / max) * 100)}%` }} />
      ))}
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

function Meter({ label, value, detail, tone = "neutral", compact = false }: { label: string; value: number; detail: string; tone?: "good" | "bad" | "neutral"; compact?: boolean }) {
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
      <p className={`mt-2 font-mono text-[10px] text-muted-foreground ${compact ? "line-clamp-1" : ""}`}>{detail}</p>
    </div>
  )
}

function SplitBar({ left, right, leftLabel, rightLabel }: { left: number; right: number; leftLabel: string; rightLabel: string }) {
  const total = Math.max(1, left + right)
  const leftPct = clamp((left / total) * 100, 0, 100)
  const rightPct = 100 - leftPct
  return (
    <div className="mt-4 space-y-2">
      <div className="flex h-2 overflow-hidden border border-border/40">
        <span className="bg-accent/80" style={{ width: `${leftPct}%` }} />
        <span className="bg-foreground/25" style={{ width: `${rightPct}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{leftLabel} {leftPct.toFixed(0)}%</span>
        <span>{rightLabel} {rightPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

function StatusRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = (count / total) * 100
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <span>{label}</span>
      <div className="h-2 border border-border/40">
        <div className={label === "active" ? "h-full bg-accent/70" : "h-full bg-foreground/35"} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right text-foreground">{count}</span>
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "border-emerald-500/50 text-emerald-400",
    registration: "border-amber-500/50 text-amber-400",
    upcoming: "border-border/50 text-muted-foreground",
    ended: "border-border/30 text-muted-foreground/70",
    settled: "border-accent/40 text-accent",
  }
  return (
    <span className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${colors[status] ?? "border-border/40 text-muted-foreground"}`}>
      {status}
    </span>
  )
}

function toneClass(tone: "good" | "bad" | "neutral") {
  if (tone === "good") return "text-accent"
  if (tone === "bad") return "text-red-400"
  return "text-foreground"
}

function seasonProgress(season: { season_start: Date | string; season_end: Date | string; status?: string }) {
  const start = new Date(season.season_start).getTime()
  const end = new Date(season.season_end).getTime()
  const now = Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return season.status === "ended" || season.status === "settled" ? 100 : 0
  return clamp(((now - start) / (end - start)) * 100, 0, 100)
}

function daysUntil(value: Date | string) {
  const target = new Date(value).getTime()
  if (!Number.isFinite(target)) return 0
  return Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000))
}

function formatDate(value: Date | string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "TBD"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
