import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import { listAgentsByOwner, listAgents, createAgent } from "@/lib/db/repositories/agents"
import { verifyAgentRegistration } from "@/lib/web3/server"
import { isValidAgentColor, isValidAgentIcon } from "@/lib/agents/icons"
import { normalizeAgentStrategy, validateStrategyForRegistration } from "@/lib/agents/strategy"

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")
  if (wallet) return NextResponse.json(await listAgentsByOwner(wallet))
  return NextResponse.json(await listAgents())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      agent_id,
      name,
      owner_wallet,
      strategy_root,
      leagues,
      season_chain_id_hex,
      deposit_usd,
      deploy_tx_hash,
      strategy,
      icon,
      color,
    } = body ?? {}

    if (typeof agent_id !== "number") throw new Error("agent_id (number) required")
    if (!name) throw new Error("name required")
    if (!ethers.isAddress(owner_wallet)) throw new Error("owner_wallet invalid")
    if (!strategy_root || typeof strategy_root !== "string") throw new Error("strategy_root required")
    if (!Array.isArray(leagues) || leagues.length === 0) throw new Error("leagues required")
    if (!deposit_usd || typeof deposit_usd !== "string") throw new Error("deposit_usd required")
    if (!deploy_tx_hash) throw new Error("deploy_tx_hash required")
    if (!strategy || typeof strategy !== "object") throw new Error("strategy required")
    if (!isValidAgentIcon(icon)) throw new Error("icon must be from the curated allowlist")
    if (!isValidAgentColor(color)) throw new Error("color must be from the curated palette")

    const normalizedStrategy = normalizeAgentStrategy({
      ...strategy,
      strategy_root,
    })
    const validationError = validateStrategyForRegistration(normalizedStrategy)
    if (validationError) throw new Error(validationError)

    const onChain = await verifyAgentRegistration(agent_id)
    if (onChain.owner.toLowerCase() !== String(owner_wallet).toLowerCase()) {
      throw new Error("On-chain owner mismatch")
    }
    if (onChain.strategyRoot.toLowerCase() !== String(strategy_root).toLowerCase()) {
      throw new Error("On-chain strategy root mismatch")
    }

    const agent = await createAgent({
      agent_id,
      name,
      owner_wallet,
      leagues,
      season_chain_id_hex: season_chain_id_hex ?? null,
      deposit_usd,
      deploy_tx_hash,
      icon,
      color,
      strategy: {
        description: normalizedStrategy.description,
        playbook: normalizedStrategy.playbook,
        strategy_root,
        sha256_hash: normalizedStrategy.sha256_hash || undefined,
        zg_storage_status: normalizedStrategy.zg_storage_status,
        zg_storage_tx_hash: normalizedStrategy.zg_storage_tx_hash,
        zg_storage_error: normalizedStrategy.zg_storage_error || undefined,
        risk_profile: normalizedStrategy.risk_profile,
        allowed_signals: normalizedStrategy.allowed_signals,
        asset_universe: normalizedStrategy.asset_universe,
        version: normalizedStrategy.version,
      },
    })

    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    const message = (error as Error).message
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
