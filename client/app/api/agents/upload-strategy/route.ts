import { NextRequest, NextResponse } from "next/server"
import { uploadStrategyCommitment } from "@/lib/0g/storage"
import {
  normalizeAgentStrategy,
  STRATEGY_VERSION,
  validateStrategyForRegistration,
  type StrategyPlaybook,
  type RiskProfile,
} from "@/lib/agents/strategy"

interface StrategyInput {
  name?: string
  description?: string
  playbook?: Partial<StrategyPlaybook>
  risk_profile?: Partial<RiskProfile>
  allowed_signals?: string[]
  asset_universe?: string[]
  league_id?: string
}

export async function POST(req: NextRequest) {
  try {
    const input = (await req.json()) as StrategyInput
    const strategy = normalizeAgentStrategy(input)
    const validationError = validateStrategyForRegistration(strategy)
    if (validationError) throw new Error(validationError)

    const doc = {
      name: input.name ?? null,
      description: strategy.description,
      playbook: strategy.playbook,
      risk_profile: strategy.risk_profile,
      allowed_signals: strategy.allowed_signals,
      asset_universe: strategy.asset_universe,
      league_id: input.league_id ?? null,
      version: STRATEGY_VERSION,
      locked_at: new Date().toISOString(),
    }

    const commitment = await uploadStrategyCommitment(doc)
    return NextResponse.json({
      doc,
      sha256Hash: commitment.sha256Hash,
      rootHash: commitment.rootHash,
      txHash: commitment.txHash,
      status: commitment.status,
      error: commitment.error ?? null,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
