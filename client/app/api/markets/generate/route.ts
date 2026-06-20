import { NextRequest, NextResponse } from "next/server"
import { connectMongo } from "@/lib/db/mongoose"
import { LeagueModel } from "@/lib/db/models/League"
import { AgentModel } from "@/lib/db/models/Agent"
import { upsertMarket } from "@/lib/db/repositories/markets"
import { getSeasonByChainId } from "@/lib/db/repositories/seasons"
import { deployMarketContract } from "@/lib/web3/server"
import { getMarketTiers } from "@/lib/engine/rank-calculator"
import { requireAdmin } from "@/lib/auth/admin"
import { ethers } from "ethers"
import { getZGConfig } from "@/lib/0g/config"

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    await connectMongo()
    const { league_id } = await req.json()
    if (!league_id) return NextResponse.json({ error: "league_id required" }, { status: 400 })

    const league = await LeagueModel.findOne({ chain_id_hex: String(league_id).toLowerCase() }).lean().exec()
    if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 })

    const season = await getSeasonByChainId(league.season_chain_id_hex)
    if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 })

    const agents = await AgentModel.find({
      leagues: league.chain_id_hex,
      status: { $in: ["registered", "active"] },
    })
      .lean()
      .exec()

    const tiers = getMarketTiers(agents.length)
    if (tiers.length === 0) return NextResponse.json({ error: "Not enough agents (min 5)" }, { status: 400 })

    const closeTimestamp = Math.floor(
      (new Date(season.season_end).getTime() - season.betting_lock_hours_before_end * 60 * 60 * 1000) / 1000,
    )

    // Validate against CHAIN time (not server wall clock) to avoid reverts
    // when RPC nodes disagree about pending/clock skew.
    const zg = getZGConfig()
    const provider = new ethers.JsonRpcProvider(zg.rpcUrl, zg.chainId)
    const latestBlock = await provider.getBlock("latest")
    const chainNow = Number(latestBlock?.timestamp ?? Math.floor(Date.now() / 1000))
    const minFutureSeconds = 60
    if (!Number.isFinite(closeTimestamp) || closeTimestamp <= chainNow + minFutureSeconds) {
      return NextResponse.json(
        {
          error: "Betting close must be in the future to deploy markets",
          details: {
            season_end: new Date(season.season_end).toISOString(),
            betting_lock_hours_before_end: season.betting_lock_hours_before_end,
            computed_betting_close_timestamp: closeTimestamp,
            computed_betting_close_iso: new Date(closeTimestamp * 1000).toISOString(),
            chain_now_timestamp: chainNow,
            chain_now_iso: new Date(chainNow * 1000).toISOString(),
          },
          hint: "You are likely inside the season's betting lock window. Either generate markets earlier, extend season_end, or reduce betting_lock_hours_before_end for this season.",
        },
        { status: 400 },
      )
    }

    const created: Array<{ contract_address: string; agent_id: number; tier: number }> = []

    for (const agent of agents) {
      for (const tier of tiers) {
        const question = `Will ${agent.name} finish in the Top ${tier} of ${league.name} - ${season.name}?`
        const deployment = await deployMarketContract({
          seasonId: season.chain_id_hex,
          agentCreator: agent.owner_wallet,
          question,
          bettingCloseTimestamp: closeTimestamp,
        })

        await upsertMarket({
          contract_address: deployment.contractAddress,
          league_chain_id_hex: league.chain_id_hex,
          season_chain_id_hex: season.chain_id_hex,
          agent_id: agent.agent_id,
          tier,
          question,
          deployment_tx_hash: deployment.txHash,
          deployed_at: new Date(),
          chain_id: Number(process.env.CHAIN_ID ?? 16602),
          status: season.status === "active" ? "open" : "pending",
        })
        created.push({ contract_address: deployment.contractAddress, agent_id: agent.agent_id, tier })
      }
    }

    return NextResponse.json(
      {
        message: `Deployed ${created.length} markets for ${agents.length} agents across tiers ${tiers.join(", ")}`,
        tiers,
        market_count: created.length,
        markets: created,
      },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
