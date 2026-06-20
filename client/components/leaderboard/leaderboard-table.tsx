"use client"

import { cn } from "@/lib/utils"
import { LivePulse } from "@/components/shared/live-pulse"

interface RankBadgeProps {
  rank: number
  className?: string
}

export function RankBadge({ rank, className }: RankBadgeProps) {
  const isTop3 = rank <= 3
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-8 h-8 font-[var(--font-bebas)] text-lg tracking-tight border",
        isTop3 ? "border-accent text-accent bg-accent/10" : "border-border/60 text-muted-foreground",
        className,
      )}
    >
      {rank}
    </span>
  )
}

interface LeaderboardEntry {
  agent_id: number
  name: string
  current_rank: number
  performance: {
    roi_pct: number
    sharpe_ratio: number
    max_drawdown_pct: number
    win_rate: number
    trade_count: number
  }
  owner_wallet?: string
}

interface LeaderboardTableProps {
  agents: LeaderboardEntry[]
  onAgentClick?: (agentId: number) => void
  live?: boolean
}

function formatPct(value: number, digits = 2) {
  if (value === 0) return "0.00%"
  const sign = value > 0 ? "+" : ""
  if (Math.abs(value) < 0.01) return `${sign}<0.01%`
  return `${sign}${value.toFixed(digits)}%`
}

export function LeaderboardTable({ agents, onAgentClick, live }: LeaderboardTableProps) {
  return (
    <div className="border border-border/40 overflow-x-auto">
      <table className="w-full text-left font-mono text-xs">
        <thead className="border-b border-border/40 bg-card/30">
          <tr>
            <th className="p-4 text-muted-foreground font-normal uppercase tracking-wider w-12">
              {live && <LivePulse className="inline-block mr-2" />}
              #
            </th>
            <th className="p-4 text-muted-foreground font-normal uppercase tracking-wider">Agent</th>
            <th className="p-4 text-muted-foreground font-normal uppercase tracking-wider text-right">ROI %</th>
            <th className="p-4 text-muted-foreground font-normal uppercase tracking-wider text-right hidden md:table-cell">Sharpe</th>
            <th className="p-4 text-muted-foreground font-normal uppercase tracking-wider text-right hidden md:table-cell">Max DD</th>
            <th className="p-4 text-muted-foreground font-normal uppercase tracking-wider text-right hidden lg:table-cell">Win Rate</th>
            <th className="p-4 text-muted-foreground font-normal uppercase tracking-wider text-right hidden lg:table-cell">Trades</th>
          </tr>
        </thead>
        <tbody className="text-muted-foreground">
          {agents.map((agent) => (
            <tr
              key={agent.agent_id}
              className={cn(
                "border-b border-border/30 transition-colors duration-200",
                onAgentClick && "cursor-pointer hover:bg-accent/5",
              )}
              onClick={() => onAgentClick?.(agent.agent_id)}
            >
              <td className="p-4">
                <RankBadge rank={agent.current_rank} />
              </td>
              <td className="p-4 text-foreground font-medium">{agent.name}</td>
              <td className={cn("p-4 text-right", agent.performance.roi_pct >= 0 ? "text-emerald-400" : "text-red-400")}>
                {formatPct(agent.performance.roi_pct)}
              </td>
              <td className="p-4 text-right hidden md:table-cell">{agent.performance.sharpe_ratio.toFixed(2)}</td>
              <td className="p-4 text-right hidden md:table-cell text-red-400/80">{agent.performance.max_drawdown_pct.toFixed(1)}%</td>
              <td className="p-4 text-right hidden lg:table-cell">{agent.performance.win_rate.toFixed(0)}%</td>
              <td className="p-4 text-right hidden lg:table-cell">{agent.performance.trade_count}</td>
            </tr>
          ))}
          {agents.length === 0 && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-muted-foreground/60">
                No agents registered yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
