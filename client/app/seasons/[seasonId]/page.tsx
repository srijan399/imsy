import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { getSeasonByChainId } from "@/lib/db/repositories/seasons"
import { listLeaguesBySeason } from "@/lib/db/repositories/leagues"
import { listMarketsByLeague } from "@/lib/db/repositories/markets"
import { DEMO_SEASONS } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

export const metadata: Metadata = {
  title: "Season - IMSY.",
  description: "Season overview with leagues, market depth, and competition status.",
}

async function getSeasonData(id: string) {
  const [season, leagues] = await Promise.all([getSeasonByChainId(id), listLeaguesBySeason(id)])
  const marketGroups = await Promise.all(
    leagues.map(async (league: any) => ({
      leagueId: league.chain_id_hex,
      markets: await listMarketsByLeague(league.chain_id_hex),
    })),
  )
  const marketsByLeague = new Map(marketGroups.map((group) => [group.leagueId, group.markets]))
  const leagueRows = leagues.map((league: any) => {
    const markets = marketsByLeague.get(league.chain_id_hex) ?? []
    const yesPool = markets.reduce((sum: number, market: any) => sum + Number(market.yes_pool ?? 0), 0)
    const noPool = markets.reduce((sum: number, market: any) => sum + Number(market.no_pool ?? 0), 0)
    const totalPool = yesPool + noPool
    return {
      ...league,
      markets,
      marketCount: markets.length,
      yesPool,
      noPool,
      totalPool,
      yesPct: totalPool > 0 ? (yesPool / totalPool) * 100 : 50,
      openMarkets: markets.filter((market: any) => market.status === "open").length,
    }
  })

  return { season, leagues: leagueRows }
}

export default async function SeasonPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params
  const { season, leagues } = await getSeasonData(seasonId)

  if (!season) {
    return (
      <main className="relative min-h-screen">
        <MarketingHeader current="seasons" />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="border border-border/40 p-10 text-center">
            <p className="font-mono text-sm text-muted-foreground">Season not found</p>
            <Link href="/seasons" className="mt-6 inline-flex border border-foreground/20 px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition-colors hover:border-accent hover:text-accent">
              All seasons
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const isDemo = isDemoDataEnabled() && DEMO_SEASONS.some((demo) => demo.chain_id_hex.toLowerCase() === season.chain_id_hex.toLowerCase())
  const assets = Array.from(new Set(leagues.flatMap((league: any) => league.asset_universe ?? []))).sort()
  const agentSlots = leagues.reduce((sum: number, league: any) => sum + Number(league.agent_count ?? 0), 0)
  const capital = leagues.reduce((sum: number, league: any) => sum + Number(league.initial_capital ?? 0), 0)
  const marketCount = leagues.reduce((sum: number, league: any) => sum + league.marketCount, 0)
  const openMarketCount = leagues.reduce((sum: number, league: any) => sum + league.openMarkets, 0)
  const totalPool = leagues.reduce((sum: number, league: any) => sum + league.totalPool, 0)
  const yesPool = leagues.reduce((sum: number, league: any) => sum + league.yesPool, 0)
  const noPool = leagues.reduce((sum: number, league: any) => sum + league.noPool, 0)
  const yesPct = totalPool > 0 ? (yesPool / totalPool) * 100 : 50
  const progress = seasonProgress(season)
  const daysLeft = daysUntil(season.season_end)
  const daysUntilStart = daysUntil(season.season_start)
  const topLeague = [...leagues].sort((a: any, b: any) => b.totalPool - a.totalPool || Number(b.agent_count ?? 0) - Number(a.agent_count ?? 0))[0]
  const activitySeries = buildActivitySeries(progress, leagues.length, marketCount, totalPool)

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="seasons" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 w-full pl-6 pr-6 pt-28 pb-24 md:pl-28 md:pr-12">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
          <Panel className="min-h-[360px] p-6 md:p-8">
            <div className="flex h-full flex-col justify-between gap-10">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={season.status} />
                  {isDemo ? <span className="border border-accent/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">demo data</span> : null}
                </div>
                <h1 className="mt-5 max-w-5xl font-[var(--font-bebas)] text-5xl leading-[0.93] tracking-tight text-foreground text-wrap md:text-7xl lg:text-8xl">
                  {season.name}
                </h1>
                {season.description ? (
                  <p className="mt-6 max-w-3xl font-mono text-sm leading-relaxed text-muted-foreground">{season.description}</p>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <SignalStrip label="Season clock" value={season.status === "active" ? `${Math.max(0, daysLeft)} days left` : season.status === "registration" ? `starts in ${Math.max(0, daysUntilStart)} days` : season.status} tone={season.status === "active" ? "good" : "neutral"} />
                <SignalStrip label="League books" value={leagues.length.toString()} />
                <SignalStrip label="Open markets" value={`${openMarketCount}/${marketCount}`} />
              </div>
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Season progress</p>
                <p className="mt-3 font-[var(--font-bebas)] text-5xl leading-none tracking-tight text-accent">{progress.toFixed(0)}%</p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">{formatDate(season.season_start)} to {formatDate(season.season_end)}</p>
              </div>
              <div className="border border-border/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                lock {season.betting_lock_hours_before_end ?? 6}h
              </div>
            </div>
            <div className="mt-8 h-36">
              <Sparkline points={activitySeries} size="large" />
            </div>
            <div className="mt-6">
              <Meter label="Calendar window" value={progress} detail={season.status === "active" ? "Season is live and markets are visible." : "Competition timing controls market availability."} tone={season.status === "active" ? "good" : "neutral"} />
            </div>
          </Panel>
        </header>

        <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Leagues"
            value={leagues.length.toString()}
            detail={`${agentSlots} visible agent slots`}
            chart={<MiniBars values={leagues.map((league: any) => Number(league.agent_count ?? 0))} />}
          />
          <KpiCard
            label="Market pool"
            value={`${totalPool.toFixed(2)} 0G`}
            detail={`${marketCount} rank markets`}
            tone={totalPool > 0 ? "good" : "neutral"}
            chart={<MiniBars values={leagues.map((league: any) => league.totalPool)} />}
          />
          <KpiCard
            label="Crowd read"
            value={`${yesPct.toFixed(0)}% yes`}
            detail={`${yesPool.toFixed(2)} YES / ${noPool.toFixed(2)} NO`}
            tone={yesPct >= 50 ? "good" : "bad"}
            chart={<Sparkline points={leagues.map((league: any) => ({ value: league.yesPct }))} />}
          />
          <KpiCard
            label="Asset breadth"
            value={assets.length.toString()}
            detail={`$${capital.toLocaleString()} starting capital`}
            chart={<MiniBars values={leagues.map((league: any) => (league.asset_universe ?? []).length)} />}
          />
        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Market pressure</p>
            <div className="mt-6 space-y-5">
              <Meter label="YES liquidity share" value={yesPct} detail={`${yesPool.toFixed(2)} 0G backing YES`} tone="good" />
              <Meter label="NO liquidity share" value={100 - yesPct} detail={`${noPool.toFixed(2)} 0G backing NO`} tone="bad" />
              <Meter label="Market coverage" value={marketCount > 0 ? (openMarketCount / marketCount) * 100 : 0} detail={`${openMarketCount} open markets`} />
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">League mix</p>
                <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Capital, risk, and agent density</h2>
              </div>
              <MiniDatum label="Deepest book" value={topLeague ? topLeague.name : "None"} />
            </div>
            <div className="mt-6 divide-y divide-border/30 border border-border/40">
              {leagues.length > 0 ? (
                leagues.map((league: any) => (
                  <LeagueRow key={league.chain_id_hex} seasonId={seasonId} league={league} />
                ))
              ) : (
                <div className="p-8 text-center font-mono text-xs text-muted-foreground">No leagues configured for this season yet.</div>
              )}
            </div>
          </Panel>
        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">League books</p>
                <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Where this season has depth</h2>
              </div>
              <MiniDatum label="Open markets" value={`${openMarketCount}/${marketCount}`} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {leagues.length > 0 ? (
                leagues.map((league: any) => (
                  <LeagueCard key={league.chain_id_hex} seasonId={seasonId} league={league} />
                ))
              ) : (
                <div className="border border-border/40 p-8 text-center font-mono text-xs text-muted-foreground lg:col-span-2">
                  Create a league to begin collecting agents and rank markets.
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Season assets</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {assets.length > 0 ? (
                assets.map((asset) => (
                  <span key={asset} className="border border-border/30 px-3 py-2 font-mono text-xs text-muted-foreground">{asset}</span>
                ))
              ) : (
                <p className="font-mono text-xs text-muted-foreground">No assets configured yet.</p>
              )}
            </div>
            <div className="mt-8 space-y-5">
              <Meter label="Asset coverage" value={Math.min(100, assets.length * 12)} detail={`${assets.length} unique assets`} />
              <Meter label="Capital scale" value={Math.min(100, capital / 60)} detail={`$${capital.toLocaleString()} paper capital`} />
              <Meter label="Agent density" value={Math.min(100, agentSlots * 4)} detail={`${agentSlots} agent slots across leagues`} />
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Schedule proof</p>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <DetailCell label="Registration start" value={formatDateTime(season.registration_start)} />
              <DetailCell label="Registration end" value={formatDateTime(season.registration_end)} />
              <DetailCell label="Season start" value={formatDateTime(season.season_start)} />
              <DetailCell label="Season end" value={formatDateTime(season.season_end)} />
              <DetailCell label="Season id" value={shortHash(season.chain_id_hex)} fullValue={season.chain_id_hex} />
              <DetailCell label="Create tx" value={shortHash(season.tx_hash)} fullValue={season.tx_hash} />
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Suggested path</p>
            <div className="mt-6 space-y-4 font-mono text-xs text-muted-foreground">
              <p className="leading-relaxed">
                Open the deepest league first, then inspect its live PnL, leaderboard, and rank markets.
              </p>
              {topLeague ? (
                <Link
                  href={`/seasons/${seasonId}/leagues/${topLeague.chain_id_hex}`}
                  className="inline-flex w-full justify-center border border-accent/50 px-5 py-3 font-mono text-xs uppercase tracking-widest text-accent transition-colors hover:bg-accent/10"
                >
                  Open {topLeague.name}
                </Link>
              ) : null}
            </div>
          </Panel>
        </section>

        <footer className="mt-16 flex flex-wrap gap-6 border-t border-border/30 pt-12">
          <Link
            href="/seasons"
            className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground transition-all duration-200 hover:border-accent hover:text-accent"
          >
            All seasons
          </Link>
          <Link href="/markets" className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground">
            Browse markets
          </Link>
        </footer>
      </div>
    </main>
  )
}

function LeagueRow({ seasonId, league }: { seasonId: string; league: any }) {
  return (
    <Link href={`/seasons/${seasonId}/leagues/${league.chain_id_hex}`} className="grid gap-4 p-4 transition-colors hover:bg-foreground/[0.03] md:grid-cols-[minmax(0,1fr)_130px_130px_170px] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-foreground">{league.name}</p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{String(league.type ?? "custom").replace("_", " ")}</p>
      </div>
      <MiniDatum label="Agents" value={league.agent_count ?? 0} />
      <MiniDatum label="Markets" value={league.marketCount} />
      <div>
        <div className="h-2 border border-border/40">
          <div className="h-full bg-accent/70" style={{ width: `${Math.min(100, league.yesPct)}%` }} />
        </div>
        <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">{league.yesPct.toFixed(0)}% YES</p>
      </div>
    </Link>
  )
}

function LeagueCard({ seasonId, league }: { seasonId: string; league: any }) {
  const assets = league.asset_universe ?? []
  return (
    <Link href={`/seasons/${seasonId}/leagues/${league.chain_id_hex}`} className="group block border border-border/40 p-5 transition-colors hover:border-accent/50">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent/80">{String(league.type ?? "custom").replace("_", " ")}</p>
          <h3 className="mt-2 font-[var(--font-bebas)] text-3xl leading-none tracking-tight text-foreground transition-colors group-hover:text-accent">
            {league.name}
          </h3>
        </div>
        <span className="border border-border/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">{league.status}</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <MiniDatum label="Agents" value={league.agent_count ?? 0} />
        <MiniDatum label="Markets" value={league.marketCount} />
        <MiniDatum label="Pool" value={`${league.totalPool.toFixed(1)}`} />
      </div>
      <div className="mt-5">
        <SplitBar left={league.yesPct} right={100 - league.yesPct} leftLabel="YES" rightLabel="NO" />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {assets.slice(0, 5).map((asset: string) => (
          <span key={asset} className="border border-border/30 px-2 py-1 font-mono text-[10px] text-muted-foreground">{asset}</span>
        ))}
      </div>
    </Link>
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

function SplitBar({ left, right, leftLabel, rightLabel }: { left: number; right: number; leftLabel: string; rightLabel: string }) {
  const total = Math.max(1, left + right)
  const leftPct = clamp((left / total) * 100, 0, 100)
  const rightPct = 100 - leftPct
  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden border border-border/40">
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

function MiniDatum({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-border/30 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 truncate font-mono text-xs text-foreground">{value}</p>
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

function buildActivitySeries(progress: number, leagueCount: number, marketCount: number, totalPool: number) {
  return Array.from({ length: 14 }, (_, index) => {
    const seasonal = Math.sin(index / 1.8) * 8
    const ramp = (index / 13) * progress
    return { value: Math.max(1, ramp + seasonal + leagueCount * 6 + marketCount * 1.5 + totalPool * 0.08) }
  })
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

function formatDateTime(value?: Date | string | null) {
  if (!value) return "Not available"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not available"
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function shortHash(value?: string | null) {
  if (!value) return "Not available"
  if (!value.startsWith("0x") || value.length < 12) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
