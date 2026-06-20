import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { getAgentByOnChainId } from "@/lib/db/repositories/agents"
import { downloadAndVerify } from "@/lib/0g/storage"
import { readAgentOnChain } from "@/lib/web3/server"
import { normalizeAgentStrategy } from "@/lib/agents/strategy"

interface StrategyResponse {
  agent_id: number
  strategy_root: string | null
  on_chain_strategy_root: string | null
  zg_storage_status?: string
  source: "0g-storage" | "mongo-only" | "local-hash-only" | "unavailable"
  verified: boolean
  doc?: unknown
  raw?: string
  error?: string
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agentId = Number(id)
  if (!Number.isFinite(agentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })

  const agent = await getAgentByOnChainId(agentId)
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

  const dbStrategy = agent.strategy ?? null
  const dbRoot = dbStrategy?.strategy_root ?? null
  const mongoDoc = dbStrategy ? normalizeAgentStrategy(dbStrategy) : undefined
  let onChainRoot: string | null = null
  try {
    const onChain = await readAgentOnChain(agentId)
    onChainRoot = onChain?.strategyRoot ?? null
  } catch {
    onChainRoot = null
  }

  const base: StrategyResponse = {
    agent_id: agentId,
    strategy_root: dbRoot,
    on_chain_strategy_root: onChainRoot,
    zg_storage_status: dbStrategy?.zg_storage_status ?? undefined,
    source: "unavailable",
    verified: false,
  }

  if (!dbRoot) {
    return NextResponse.json({ ...base, error: "No strategy root recorded for this agent" })
  }

  // If the upload only produced a local sha256 hash, the doc was never put on
  // 0G — the on-chain commit is just sha256 padded to bytes32. Don't try to
  // download; just surface the status.
  if (dbStrategy?.zg_storage_status === "local_hash_only") {
    return NextResponse.json({
      ...base,
      source: "local-hash-only",
      verified: false,
      doc: mongoDoc,
      error: "Strategy was hashed locally but never uploaded to 0G Storage. Set IMSY_REQUIRE_0G=true in production.",
    })
  }

  try {
    const buf = await downloadAndVerify(dbRoot)
    const text = buf.toString("utf8")

    // Verify content sha256 matches the recorded hash if available.
    let verified = true
    if (dbStrategy?.sha256_hash) {
      const sha = createHash("sha256").update(buf).digest("hex")
      verified = sha === dbStrategy.sha256_hash
    }

    let doc: unknown = text
    try {
      doc = JSON.parse(text)
    } catch {
      // doc may be plain text
    }

    return NextResponse.json({
      ...base,
      source: "0g-storage",
      verified,
      doc,
      raw: text.length > 4096 ? `${text.slice(0, 4096)}…` : text,
    } satisfies StrategyResponse)
  } catch (error) {
    return NextResponse.json({
      ...base,
      source: "mongo-only",
      verified: false,
      doc: mongoDoc,
      error: `0G Storage download failed: ${(error as Error).message}`,
    } satisfies StrategyResponse)
  }
}
