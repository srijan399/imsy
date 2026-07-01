import { NextRequest, NextResponse } from "next/server"
import { connectMongo } from "@/lib/db/mongoose"
import { AgentModel } from "@/lib/db/models/Agent"
import { listSnapshotsByLeague } from "@/lib/db/repositories/values"
import { getDemoPnlHistory } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

const DEFAULT_WINDOW_MS = 60 * 60 * 1000 // 1h

/**
 * Returns per-agent PnL series for a league since `since` (default: 1h ago).
 * Optional `interval` (seconds) buckets points down for chart smoothness.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectMongo()
  const { id } = await params
  const leagueId = String(id).toLowerCase()

  const sinceParam = req.nextUrl.searchParams.get("since")
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - DEFAULT_WINDOW_MS)
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid since" }, { status: 400 })
  }
  const intervalSec = Number(req.nextUrl.searchParams.get("interval") ?? 0)

  const [agents, snapshots] = await Promise.all([
    AgentModel.find({ leagues: leagueId }).lean().exec(),
    listSnapshotsByLeague(leagueId, since),
  ])

  if ((agents.length === 0 || snapshots.length === 0) && isDemoDataEnabled()) {
    return NextResponse.json({ league_id: leagueId, ...getDemoPnlHistory(leagueId) })
  }

  const grouped = new Map<number, Array<{ ts: number; pnl_pct: number; total_value_usd: string }>>()
  for (const snap of snapshots) {
    const ts = new Date(snap.timestamp).getTime()
    const key = intervalSec > 0 ? Math.floor(ts / (intervalSec * 1000)) * (intervalSec * 1000) : ts
    const list = grouped.get(snap.agent_id) ?? []
    list.push({ ts: key, pnl_pct: snap.pnl_pct, total_value_usd: snap.total_value_usd })
    grouped.set(snap.agent_id, list)
  }

  const series = agents.map((agent) => ({
    agent_id: agent.agent_id,
    name: agent.name,
    icon: agent.icon ?? "Bot",
    color: agent.color ?? "#888888",
    points: (grouped.get(agent.agent_id) ?? []).map((p) => ({
      ts: new Date(p.ts).toISOString(),
      pnl_pct: p.pnl_pct,
      total_value_usd: p.total_value_usd,
    })),
  }))

  return NextResponse.json({ league_id: leagueId, since: since.toISOString(), series })
}
