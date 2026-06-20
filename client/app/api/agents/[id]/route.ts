import { NextRequest, NextResponse } from "next/server"
import { getAgentDetail } from "@/lib/db/repositories/agents"
import {
  readAgentAssetsOnChain,
  readAgentOnChain,
  readAgentPositionOnChain,
} from "@/lib/web3/server"
import { fetchTokenPrices } from "@/lib/engine/prices"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agentId = Number(id)
  if (!Number.isFinite(agentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const detail = await getAgentDetail(agentId)
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const onChain = await readAgentOnChain(agentId)
    if (!onChain) return NextResponse.json({ ...detail, on_chain: null, error: "Agent not on chain" })

    const assets = await readAgentAssetsOnChain(agentId)
    const prices = assets.length ? await fetchTokenPrices(assets) : {}
    const positions = await Promise.all(
      assets.map(async (asset) => {
        const pos = await readAgentPositionOnChain(agentId, asset)
        return {
          asset,
          qty: pos.qty.toString(),
          avgPriceUsd: pos.avgPriceUsd.toString(),
          lastPriceUsd: prices[asset]?.usd ?? null,
        }
      }),
    )

    return NextResponse.json({
      ...detail,
      on_chain: {
        owner: onChain.owner,
        name: onChain.name,
        strategyRoot: onChain.strategyRoot,
        cashUsd: onChain.cashUsd.toString(),
        tradeCount: onChain.tradeCount.toString(),
        createdAt: onChain.createdAt.toString(),
        positions,
      },
    })
  } catch (error) {
    return NextResponse.json({ ...detail, on_chain: null, error: (error as Error).message })
  }
}
