import type { Metadata } from "next"
import Link from "next/link"
import { ethers } from "ethers"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { StatCard } from "@/components/shared/stat-card"
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
import { formatUsd, formatUsdCompact } from "@/lib/web3/peg"
import { normalizeAgentStrategy } from "@/lib/agents/strategy"

export const metadata: Metadata = {
  title: "Agent — IMSY.",
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

  const { agent: rawAgent, trades, markets } = detail
  const strategy = normalizeAgentStrategy(rawAgent.strategy)
  const performance = rawAgent.performance ?? {
    roi_pct: 0,
    sharpe_ratio: 0,
    max_drawdown_pct: 0,
    consistency_score: 0,
    trade_count: 0,
    win_rate: 0,
  }
  const agent = { ...rawAgent, strategy, performance }
  const onChain = await readAgentOnChain(id)
  const league = agent.leagues?.[0]
    ? await LeagueModel.findOne({ chain_id_hex: agent.leagues[0] }).lean().exec()
    : null

  const assets = onChain ? await readAgentAssetsOnChain(id) : []
  const prices = assets.length ? await fetchTokenPrices(assets) : {}
  const positions = await Promise.all(
    assets.map(async (asset) => {
      const pos = await readAgentPositionOnChain(id, asset)
      return { asset, qty: pos.qty, avgPriceUsd: pos.avgPriceUsd, lastUsd: prices[asset]?.usd ?? 0 }
    }),
  )

  const cashUsdScaled = onChain?.cashUsd ?? 0n

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-16 relative">
          <SectionLabel>{agent.status} agent</SectionLabel>
          <h1
            className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none flex items-center gap-4"
            style={{ color: agent.color || undefined }}
          >
            {agent.icon ? (
              <AgentIconRender icon={agent.icon} color={agent.color || undefined} size={56} />
            ) : null}
            <span>{agent.name}</span>
          </h1>
          <p className="mt-4 max-w-2xl font-mono text-xs text-muted-foreground leading-relaxed">
            {strategy.description || "No public strategy description."}
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <StatCard label="Rank" value={`#${agent.current_rank}`} />
          <StatCard
            label="ROI"
            value={`${performance.roi_pct.toFixed(2)}%`}
            trend={performance.roi_pct >= 0 ? "up" : "down"}
          />
          <StatCard label="Cash" value={formatUsdCompact(cashUsdScaled)} />
          <StatCard label="Trades" value={performance.trade_count} />
        </div>

        <AgentActions
          agentId={id}
          ownerWallet={agent.owner_wallet}
          leagues={agent.leagues}
        />

        <section className="my-16">
          <StrategyViewer agentId={id} />
        </section>

        <section className="my-16">
          <div className="border border-border/40 p-6 space-y-5 max-w-4xl">
            <SectionLabel>Registration proof</SectionLabel>
            <ZGStorageBadge
              rootHash={strategy.strategy_root}
              txHash={strategy.zg_storage_tx_hash ?? undefined}
              status={strategy.zg_storage_status ?? undefined}
              error={strategy.zg_storage_error ?? undefined}
            />
            <div className="grid sm:grid-cols-2 gap-4 font-mono text-xs text-muted-foreground">
              <p>
                League
                <span className="block mt-1 text-foreground">{league?.name ?? "Unknown"}</span>
              </p>
              <p>
                Strategy root
                <span className="block mt-1 break-all text-foreground">{strategy.strategy_root}</span>
              </p>
              <p>
                On-chain owner
                <span className="block mt-1 break-all text-foreground">{onChain?.owner ?? agent.owner_wallet}</span>
              </p>
            </div>
          </div>
        </section>

        {positions.length > 0 && (
          <section className="mb-16 space-y-4">
            <SectionLabel>Positions</SectionLabel>
            <div className="border border-border/40 divide-y divide-border/30">
              {positions.map((p) => {
                const qty = Number(ethers.formatUnits(p.qty, 18))
                return (
                  <div
                    key={p.asset}
                    className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 font-mono text-xs"
                  >
                    <span className="text-foreground">{p.asset}</span>
                    <span className="text-muted-foreground">{qty.toFixed(6)}</span>
                    <span className="text-muted-foreground">avg {formatUsd(p.avgPriceUsd)}</span>
                    <span className="text-muted-foreground">last ${p.lastUsd.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {markets.length > 0 && (
          <section className="mb-16 space-y-4">
            <SectionLabel>Rank markets</SectionLabel>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {markets.map((market) => (
                <MarketCard
                  key={market.contract_address}
                  id={market.contract_address}
                  question={market.question}
                  tier={market.tier}
                  yesPool={market.yes_pool}
                  noPool={market.no_pool}
                  status={market.status}
                  outcome={market.outcome ?? null}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <SectionLabel>Trade log</SectionLabel>
          {trades.length === 0 ? (
            <div className="border border-border/40 p-8 text-center font-mono text-xs text-muted-foreground">
              No trades logged yet.
            </div>
          ) : (
            <div className="divide-y divide-border/30 border border-border/40">
              {trades.map((trade, idx) => {
                const priceUsd = trade.price_usd ? formatUsd(BigInt(trade.price_usd)) : "—"
                return (
                  <div
                    key={`${trade.tx_hash ?? idx}`}
                    className="grid md:grid-cols-[0.8fr_0.8fr_1fr_2fr] gap-3 p-4 font-mono text-xs"
                  >
                    <span className={`uppercase ${trade.success ? "text-accent" : "text-red-400"}`}>{trade.action}</span>
                    <span className="text-foreground">
                      {trade.quantity} {trade.asset}
                    </span>
                    <span className="text-muted-foreground">{priceUsd}</span>
                    <span className="text-muted-foreground">{trade.reason || ""}</span>
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
