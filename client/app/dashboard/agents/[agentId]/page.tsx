import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { ethers } from "ethers"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { MarketCard } from "@/components/markets/market-card"
import { ZGStorageBadge } from "@/components/shared/zg-storage-badge"
import { AgentActions } from "@/components/agents/agent-actions"
import { StrategyViewer } from "@/components/agents/strategy-viewer"
import { AgentIconRender } from "@/components/agents/icon-picker"
import { connectMongo } from "@/lib/db/mongoose"
import { getAgentDetail } from "@/lib/db/repositories/agents"
import { LeagueModel } from "@/lib/db/models/League"
import {
  readAgentAssetsOnChain,
  readAgentOnChain,
  readAgentPositionOnChain,
} from "@/lib/web3/server"
import { fetchTokenPrices } from "@/lib/engine/prices"
import { formatUsd, formatUsdCompact, usdToNumber } from "@/lib/web3/peg"
import { normalizeAgentStrategy } from "@/lib/agents/strategy"
import { isDemoDataEnabled } from "@/lib/demo-mode"

export const metadata: Metadata = {
  title: "Agent - IMSY.",
  description: "Agent performance, sealed strategy, rank markets, and trade log.",
}

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const id = Number(agentId)
  if (!Number.isFinite(id)) {
    return (
      <main className="relative min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground">Invalid agent id</p>
      </main>
    )
  }

  await connectMongo()
  const detail = await getAgentDetail(id)
  if (!detail) {
    return (
      <main className="relative min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground">Agent not found</p>
      </main>
    )
  }

  const { agent: rawAgent, trades: rawTrades, markets: rawMarkets } = detail as { agent: any; trades: any[]; markets: any[] }
  const strategy = normalizeAgentStrategy(rawAgent.strategy)
  const demo = isDemoDataEnabled() && id === 24 ? getAgentShowcaseData(rawAgent.agent_id) : null
  const performance = demo?.performance ?? rawAgent.performance ?? {
    roi_pct: 0,
    sharpe_ratio: 0,
    max_drawdown_pct: 0,
    consistency_score: 0,
    trade_count: 0,
    win_rate: 0,
  }
  const agent = {
    ...rawAgent,
    current_rank: demo?.currentRank ?? rawAgent.current_rank,
    deposit_usd: demo?.depositUsdScaled ?? rawAgent.deposit_usd,
    status: demo?.status ?? rawAgent.status,
    strategy,
    performance,
  }
  const onChain = await readAgentOnChain(id).catch(() => null)
  const league = agent.leagues?.[0]
    ? await LeagueModel.findOne({ chain_id_hex: agent.leagues[0] }).lean().exec()
    : null

  const assets = onChain ? await readAgentAssetsOnChain(id).catch(() => []) : []
  const prices = assets.length ? await fetchTokenPrices(assets) : {}
  const positions = await Promise.all(
    assets.map(async (asset) => {
      const pos = await readAgentPositionOnChain(id, asset).catch(() => ({ asset, qty: 0n, avgPriceUsd: 0n }))
      return { asset, qty: pos.qty, avgPriceUsd: pos.avgPriceUsd, lastUsd: prices[asset]?.usd ?? 0 }
    }),
  )

  const cashUsdScaled = onChain?.cashUsd ?? 0n
  const cashUsd = demo?.cashUsd ?? usdToNumber(cashUsdScaled)
  const positionRows = demo?.positions ?? positions
    .map((p) => {
      const qty = Number(ethers.formatUnits(p.qty, 18))
      const valueUsd = qty * p.lastUsd
      return { ...p, qty, valueUsd }
    })
    .sort((a, b) => b.valueUsd - a.valueUsd)
  const positionsValueUsd = positionRows.reduce((sum, p) => sum + p.valueUsd, 0)
  const portfolioUsd = cashUsd + positionsValueUsd
  const largestPositionPct = portfolioUsd > 0 ? Math.max(0, ...positionRows.map((p) => (p.valueUsd / portfolioUsd) * 100)) : 0
  const rankHistory = demo?.rankHistory ?? (agent.rank_history ?? []).slice(-14)
  const rankSeries = rankHistory.length
    ? rankHistory.map((point: any) => ({ value: Number(point.rank), label: formatDate(point.timestamp) }))
    : [{ value: Number(agent.current_rank || 0), label: "Now" }]
  const roiSeries = rankHistory.length
    ? rankHistory.map((point: any) => ({ value: Number(point.roi_pct ?? 0), label: formatDate(point.timestamp) }))
    : [{ value: Number(performance.roi_pct ?? 0), label: "Now" }]
  const previousRank = rankHistory.length > 1 ? Number(rankHistory[rankHistory.length - 2]?.rank) : Number(agent.current_rank)
  const rankMove = previousRank - Number(agent.current_rank)
  const marketRows = demo?.markets ?? rawMarkets
  const tradeRows = demo?.trades ?? rawTrades
  const marketStats = marketRows.map((market) => {
    const yesPool = Number(market.yes_pool ?? 0)
    const noPool = Number(market.no_pool ?? 0)
    const total = yesPool + noPool
    return {
      ...market,
      yesPool,
      noPool,
      total,
      yesPct: total > 0 ? (yesPool / total) * 100 : 50,
      noPct: total > 0 ? (noPool / total) * 100 : 50,
    }
  })
  const totalMarketPool = marketStats.reduce((sum, market) => sum + market.total, 0)
  const openMarketCount = marketStats.filter((market) => market.status === "open").length
  const weightedYesPct =
    totalMarketPool > 0
      ? marketStats.reduce((sum, market) => sum + market.yesPool, 0) / totalMarketPool * 100
      : 0
  const topMarket = [...marketStats].sort((a, b) => b.total - a.total)[0]
  const tradeCounts = {
    buy: tradeRows.filter((trade) => trade.action === "buy").length,
    sell: tradeRows.filter((trade) => trade.action === "sell").length,
    hold: tradeRows.filter((trade) => trade.action === "hold").length,
  }
  const successfulTrades = tradeRows.filter((trade) => trade.success).length
  const tradeSuccessRate = tradeRows.length > 0 ? (successfulTrades / tradeRows.length) * 100 : 0
  const avgConfidence = tradeRows.length > 0
    ? tradeRows.reduce((sum, trade) => {
        const confidence = Number(trade.confidence ?? 0)
        return sum + (confidence <= 1 ? confidence * 100 : confidence)
      }, 0) / tradeRows.length
    : 0
  const riskUsedPct =
    strategy.risk_profile.max_drawdown_pct > 0
      ? (Number(performance.max_drawdown_pct ?? 0) / strategy.risk_profile.max_drawdown_pct) * 100
      : 0
  const capitalSeries = positionRows.length
    ? positionRows.slice(0, 8).map((p) => p.valueUsd)
    : [cashUsd]

  return (
    <main className="relative min-h-[100dvh]">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="relative mb-10 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
          <Panel className="min-h-[360px] p-6 md:p-8">
            <div className="flex flex-col justify-between gap-10 h-full">
              <div>
                <SectionLabel>{agent.status} agent</SectionLabel>
                <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <h1
                      className="font-[var(--font-bebas)] text-5xl tracking-tight leading-[0.92] text-wrap md:text-7xl lg:text-8xl"
                      style={{ color: agent.color || undefined }}
                    >
                      <span className="inline-flex max-w-full items-center gap-4">
                        {agent.icon ? (
                          <AgentIconRender icon={agent.icon} color={agent.color || undefined} size={56} />
                        ) : null}
                        <span className="min-w-0 break-words">{agent.name}</span>
                      </span>
                    </h1>
                    <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                      {strategy.description || "No public strategy description."}
                    </p>
                  </div>
                  <div className="grid min-w-[180px] grid-cols-2 gap-3 font-mono text-xs lg:text-right">
                    <ProofChip label="League" value={league?.name ?? "Unknown"} />
                    <ProofChip label="Agent ID" value={`#${agent.agent_id}`} />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <SignalStrip label="Rank movement" value={formatRankMove(rankMove)} tone={rankMove >= 0 ? "good" : "bad"} />
                <SignalStrip label="Open markets" value={`${openMarketCount}/${marketRows.length}`} />
                <SignalStrip label="0G proof" value={strategy.zg_storage_status === "uploaded" ? "Uploaded" : "Local hash"} />
              </div>
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Market read</p>
                <p className="mt-3 font-[var(--font-bebas)] text-4xl leading-none tracking-tight text-foreground">
                  {weightedYesPct > 0 ? `${weightedYesPct.toFixed(0)}% yes` : "No flow"}
                </p>
              </div>
              <div className="border border-border/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {topMarket ? `Top ${topMarket.tier}` : "No market"}
              </div>
            </div>
            <div className="mt-8">
              <SplitBar
                left={weightedYesPct}
                right={weightedYesPct > 0 ? 100 - weightedYesPct : 0}
                leftLabel="YES"
                rightLabel="NO"
                empty={totalMarketPool <= 0}
              />
            </div>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <MiniDatum label="Total pool" value={`${totalMarketPool.toFixed(3)} 0G`} />
              <MiniDatum label="Largest book" value={topMarket ? `${topMarket.total.toFixed(3)} 0G` : "0.000 0G"} />
            </div>
          </Panel>
        </header>

        <section className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Current rank"
            value={`#${agent.current_rank}`}
            detail={formatRankMove(rankMove)}
            tone={rankMove >= 0 ? "good" : "bad"}
            chart={<Sparkline points={rankSeries} invert />}
          />
          <MetricCard
            label="Portfolio"
            value={formatUsdNumber(portfolioUsd)}
            detail={`${formatUsdNumber(cashUsd)} cash`}
            chart={<MiniBars values={capitalSeries} />}
          />
          <MetricCard
            label="ROI"
            value={`${withSign(performance.roi_pct)}%`}
            detail={`${performance.sharpe_ratio.toFixed(2)} sharpe`}
            tone={performance.roi_pct >= 0 ? "good" : "bad"}
            chart={<Sparkline points={roiSeries} />}
          />
          <MetricCard
            label="Trade quality"
            value={`${tradeSuccessRate.toFixed(0)}%`}
            detail={`${avgConfidence.toFixed(0)}% avg confidence`}
            chart={<ActionMix buy={tradeCounts.buy} sell={tradeCounts.sell} hold={tradeCounts.hold} />}
          />
        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Performance telemetry</p>
                <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Rank and return curve</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
                <MiniDatum label="Drawdown" value={`${performance.max_drawdown_pct.toFixed(2)}%`} />
                <MiniDatum label="Win rate" value={`${performance.win_rate.toFixed(1)}%`} />
              </div>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <ChartFrame label="Rank history" footer="Lower is better">
                <Sparkline points={rankSeries} invert size="large" />
              </ChartFrame>
              <ChartFrame label="ROI history" footer={`${rankSeries.length} snapshots`}>
                <Sparkline points={roiSeries} size="large" />
              </ChartFrame>
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Risk envelope</p>
            <div className="mt-6 space-y-6">
              <Meter label="Drawdown cap used" value={riskUsedPct} detail={`${performance.max_drawdown_pct.toFixed(2)}% of ${strategy.risk_profile.max_drawdown_pct}%`} tone={riskUsedPct > 80 ? "bad" : "good"} />
              <Meter label="Largest position" value={largestPositionPct} detail={`${largestPositionPct.toFixed(1)}% of portfolio`} tone={largestPositionPct > strategy.risk_profile.max_position_size_pct ? "bad" : "neutral"} />
              <Meter label="Leverage allowance" value={Math.min(100, (strategy.risk_profile.leverage_cap / 5) * 100)} detail={`${strategy.risk_profile.leverage_cap}x cap`} />
            </div>
          </Panel>
        </section>

        <section className="mb-10">
          <AgentActions
            agentId={id}
            ownerWallet={agent.owner_wallet}
            leagues={agent.leagues}
          />
        </section>

        <section className="mb-10 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Panel className="p-5 md:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Capital allocation</p>
            <div className="mt-5 space-y-3">
              <AllocationRow label="Cash" value={cashUsd} total={portfolioUsd} />
              {positionRows.length > 0 ? (
                positionRows.map((position) => (
                  <AllocationRow key={position.asset} label={shortAddress(position.asset)} value={position.valueUsd} total={portfolioUsd} />
                ))
              ) : (
                <EmptyBlock>No token positions are open right now.</EmptyBlock>
              )}
            </div>
          </Panel>

          <Panel className="p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Position book</p>
                <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Exposure by asset</h2>
              </div>
              <MiniDatum label="Deposit" value={formatUsdCompact(agent.deposit_usd)} />
            </div>
            {positionRows.length > 0 ? (
              <div className="mt-6 divide-y divide-border/30 border border-border/30">
                {positionRows.map((p) => (
                  <div
                    key={p.asset}
                    className="grid gap-3 p-4 font-mono text-xs md:grid-cols-[1fr_0.8fr_0.8fr_0.8fr]"
                  >
                    <span className="break-all text-foreground">{p.asset}</span>
                    <span className="text-muted-foreground">{p.qty.toFixed(6)}</span>
                    <span className="text-muted-foreground">avg {safeFormatUsd(p.avgPriceUsd)}</span>
                    <span className="text-foreground">{formatUsdNumber(p.valueUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyBlock className="mt-6">No active positions to price.</EmptyBlock>
            )}
          </Panel>
        </section>

        {marketRows.length > 0 && (
          <section className="mb-10 space-y-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Rank markets</p>
              <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Where the crowd is pricing this agent</h2>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Panel className="p-5 md:p-6">
                <div className="space-y-5">
                  {marketStats.slice(0, 5).map((market) => (
                    <MarketOddsRow key={market.contract_address} market={market} />
                  ))}
                </div>
              </Panel>
              <div className="grid gap-4 md:grid-cols-2">
                {marketRows.map((market) => (
                  <MarketCard
                    key={market.contract_address}
                    id={market.contract_address}
                    question={market.question}
                    tier={market.tier}
                    yesPool={market.yes_pool}
                    noPool={market.no_pool}
                    status={market.status as "pending" | "open" | "locked" | "resolved"}
                    outcome={market.outcome ?? null}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="mb-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <StrategyViewer agentId={id} />

          <Panel className="p-5 md:p-6 space-y-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Registration proof</p>
            <ZGStorageBadge
              rootHash={strategy.strategy_root}
              txHash={strategy.zg_storage_tx_hash ?? undefined}
              status={strategy.zg_storage_status ?? undefined}
              error={strategy.zg_storage_error ?? undefined}
            />
            <div className="space-y-4 font-mono text-xs text-muted-foreground">
              <ProofCell label="Strategy root" value={strategy.strategy_root} />
              <ProofCell label="On-chain owner" value={onChain?.owner ?? agent.owner_wallet} />
              <ProofCell label="Deploy tx" value={agent.deploy_tx_hash} />
            </div>
          </Panel>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Trade tape</p>
              <h2 className="mt-2 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">Latest execution evidence</h2>
            </div>
            <div className="grid grid-cols-3 gap-2 md:min-w-[320px]">
              <MiniDatum label="Buy" value={tradeCounts.buy} />
              <MiniDatum label="Sell" value={tradeCounts.sell} />
              <MiniDatum label="Hold" value={tradeCounts.hold} />
            </div>
          </div>
          {tradeRows.length === 0 ? (
            <EmptyBlock>No trades logged yet.</EmptyBlock>
          ) : (
            <div className="divide-y divide-border/30 border border-border/40">
              {tradeRows.map((trade, idx) => {
                const confidence = Number(trade.confidence ?? 0)
                const normalizedConfidence = confidence <= 1 ? confidence * 100 : confidence
                return (
                  <div
                    key={`${trade.tx_hash ?? idx}`}
                    className="grid gap-3 p-4 font-mono text-xs md:grid-cols-[0.55fr_0.8fr_0.7fr_0.65fr_minmax(0,2fr)] md:items-center"
                  >
                    <span className={`uppercase ${trade.success ? "text-accent" : "text-red-400"}`}>{trade.action}</span>
                    <span className="text-foreground">
                      {trade.quantity} {trade.asset}
                    </span>
                    <span className="text-muted-foreground">{safeFormatUsd(trade.price_usd)}</span>
                    <span className="text-muted-foreground">{normalizedConfidence.toFixed(0)}% conf</span>
                    <span className="text-muted-foreground">{trade.reason || "No execution note."}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <footer className="pt-12 border-t border-border/30 mt-16 flex flex-wrap gap-6">
          <Link
            href="/dashboard/agents"
            className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
          >
            My agents
          </Link>
          <Link
            href="/markets"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Browse markets
          </Link>
        </footer>
      </div>
    </main>
  )
}

function getAgentShowcaseData(agentId: number) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const rankHistory = [
    { rank: 12, roi_pct: -8.6 },
    { rank: 10, roi_pct: -4.1 },
    { rank: 13, roi_pct: -12.8 },
    { rank: 9, roi_pct: 1.9 },
    { rank: 7, roi_pct: 9.7 },
    { rank: 8, roi_pct: 6.4 },
    { rank: 6, roi_pct: 14.8 },
    { rank: 4, roi_pct: 27.3 },
    { rank: 5, roi_pct: 22.6 },
    { rank: 3, roi_pct: 38.2 },
    { rank: 2, roi_pct: 51.4 },
    { rank: 4, roi_pct: 42.9 },
    { rank: 4, roi_pct: 57.8 },
    { rank: 3, roi_pct: 64.7 },
  ].map((point, index) => ({
    timestamp: new Date(now - (13 - index) * day),
    ...point,
  }))

  return {
    currentRank: 3,
    status: "active",
    cashUsd: 318.42,
    depositUsdScaled: usdScaledString(1_000),
    performance: {
      roi_pct: 64.7,
      sharpe_ratio: 2.18,
      max_drawdown_pct: 7.4,
      consistency_score: 82,
      trade_count: 37,
      win_rate: 64.9,
    },
    rankHistory,
    positions: [
      {
        asset: "WETH",
        qty: 0.31,
        avgPriceUsd: usdScaledString(3168.14),
        lastUsd: 3422.9,
        valueUsd: 1061.1,
      },
      {
        asset: "SOL",
        qty: 4.85,
        avgPriceUsd: usdScaledString(131.44),
        lastUsd: 154.72,
        valueUsd: 750.39,
      },
      {
        asset: "LINK",
        qty: 27.4,
        avgPriceUsd: usdScaledString(14.21),
        lastUsd: 17.86,
        valueUsd: 489.36,
      },
      {
        asset: "ARB",
        qty: 518,
        avgPriceUsd: usdScaledString(0.64),
        lastUsd: 0.78,
        valueUsd: 404.04,
      },
    ],
    markets: [
      showcaseMarket(agentId, 1, "Will Rocket finish top 1?", 42.18, 21.75),
      showcaseMarket(agentId, 3, "Will Rocket finish top 3?", 73.52, 18.4),
      showcaseMarket(agentId, 5, "Will Rocket finish top 5?", 96.08, 13.92),
      showcaseMarket(agentId, 10, "Will Rocket finish top 10?", 121.7, 8.66),
    ],
    trades: [
      showcaseTrade("buy", "SOL", 1.18, 154.72, 0.91, "Momentum confirmed after rank basket rotated into high-beta majors."),
      showcaseTrade("sell", "WETH", 0.04, 3422.9, 0.84, "Trimmed after two candles failed to extend above the volatility band."),
      showcaseTrade("buy", "LINK", 8.6, 17.86, 0.88, "Oracle basket led the league watchlist while market YES flow accelerated."),
      showcaseTrade("hold", "ARB", 0, 0.78, 0.73, "Spread was wide, holding existing exposure until liquidity improves."),
      showcaseTrade("buy", "WETH", 0.08, 3374.25, 0.86, "Re-entered after drawdown pressure cleared and rank delta turned positive."),
      showcaseTrade("sell", "SOL", 0.72, 157.11, 0.79, "Locked partial profit before scheduled engine tick and reduced beta drift."),
      showcaseTrade("buy", "ARB", 164, 0.78, 0.68, "Small tactical add after perp funding cooled and downside pool thinned."),
      showcaseTrade("buy", "LINK", 5.2, 17.48, 0.82, "Signal stack stayed aligned across volume, relative strength, and rank odds."),
    ],
  }
}

function showcaseMarket(agentId: number, tier: number, question: string, yes_pool: number, no_pool: number) {
  return {
    contract_address: `0x${agentId.toString(16).padStart(2, "0")}${tier.toString(16).padStart(2, "0")}f3a7c92b1d4e6a88901c28f6d5b4e3c2a190`,
    question,
    tier,
    yes_pool,
    no_pool,
    status: "open" as const,
    outcome: null,
  }
}

function showcaseTrade(action: "buy" | "sell" | "hold", asset: string, quantity: number, priceUsd: number, confidence: number, reason: string) {
  return {
    action,
    asset,
    quantity,
    price_usd: usdScaledString(priceUsd),
    success: true,
    confidence,
    reason,
    tx_hash: `${action}-${asset}-${quantity}`,
  }
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-border/40 bg-background/70 ${className}`}>{children}</div>
}

function MetricCard({
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

function Sparkline({
  points,
  invert = false,
  size = "small",
}: {
  points: Array<{ value: number; label?: string }>
  invert?: boolean
  size?: "small" | "large"
}) {
  const width = 320
  const height = size === "large" ? 150 : 64
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
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Metric trend" className="h-full min-h-12 w-full overflow-visible">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="oklch(0.7 0.2 45)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <polyline
        points={`0,${height} ${coords.join(" ")} ${width},${height}`}
        fill="oklch(0.7 0.2 45 / 0.08)"
        stroke="none"
      />
    </svg>
  )
}

function MiniBars({ values }: { values: number[] }) {
  const safeValues = values.length ? values : [0]
  const max = Math.max(1, ...safeValues.map((value) => Math.abs(value)))
  return (
    <div className="flex h-16 items-end gap-1.5" aria-label="Capital distribution">
      {safeValues.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="block flex-1 bg-accent/70"
          style={{ height: `${Math.max(8, (Math.abs(value) / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function ActionMix({ buy, sell, hold }: { buy: number; sell: number; hold: number }) {
  const total = Math.max(1, buy + sell + hold)
  return (
    <div className="space-y-2">
      <SplitBar left={(buy / total) * 100} right={(sell / total) * 100} leftLabel="BUY" rightLabel="SELL" empty={buy + sell + hold === 0} />
      <p className="font-mono text-[10px] text-muted-foreground">{hold} holds in latest tape</p>
    </div>
  )
}

function SplitBar({
  left,
  right,
  leftLabel,
  rightLabel,
  empty = false,
}: {
  left: number
  right: number
  leftLabel: string
  rightLabel: string
  empty?: boolean
}) {
  const total = Math.max(1, left + right)
  const leftPct = Math.max(0, Math.min(100, (left / total) * 100))
  const rightPct = Math.max(0, 100 - leftPct)

  if (empty) {
    return (
      <div className="space-y-2">
        <div className="h-3 border border-border/40 bg-muted/20" />
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>{leftLabel} 0%</span>
          <span>{rightLabel} 0%</span>
        </div>
      </div>
    )
  }

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

function Meter({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string
  value: number
  detail: string
  tone?: "good" | "bad" | "neutral"
}) {
  const pct = Math.max(0, Math.min(100, value))
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

function AllocationRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 font-mono text-xs">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">{formatUsdNumber(value)}</span>
      </div>
      <div className="h-2 border border-border/40">
        <div className="h-full bg-accent/70" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

function MarketOddsRow({ market }: { market: { contract_address: string; tier: number; status: string; total: number; yesPct: number; noPct: number } }) {
  return (
    <Link href={`/markets/${market.contract_address}`} className="block border border-border/30 p-4 transition-colors duration-200 hover:border-accent/50">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Top {market.tier}</p>
          <p className="mt-1 font-mono text-xs text-foreground">{market.status}</p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{market.total.toFixed(3)} 0G</p>
      </div>
      <SplitBar left={market.yesPct} right={market.noPct} leftLabel="YES" rightLabel="NO" />
    </Link>
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

function ProofChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/30 p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-foreground">{value}</p>
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

function ProofCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-foreground">{value || "Not available"}</p>
    </div>
  )
}

function EmptyBlock({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-border/40 p-8 text-center font-mono text-xs text-muted-foreground ${className}`}>
      {children}
    </div>
  )
}

function formatDate(date: Date | string | number) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return "Now"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatRankMove(move: number) {
  if (move > 0) return `+${move} places`
  if (move < 0) return `${move} places`
  return "No change"
}

function withSign(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`
}

function toneClass(tone: "good" | "bad" | "neutral") {
  if (tone === "good") return "text-accent"
  if (tone === "bad") return "text-red-400"
  return "text-foreground"
}

function formatUsdNumber(value: number) {
  if (!Number.isFinite(value)) return "$0.00"
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function usdScaledString(value: number) {
  return BigInt(Math.round(value * 1_000_000)) * 10n ** 12n
}

function safeFormatUsd(value?: bigint | string | number | null) {
  if (value === null || value === undefined || value === "") return "Not priced"
  try {
    return typeof value === "number" ? formatUsdNumber(value) : formatUsd(value)
  } catch {
    return "Not priced"
  }
}

function shortAddress(value: string) {
  if (!value.startsWith("0x") || value.length < 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}
