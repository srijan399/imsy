import { NextRequest, NextResponse } from "next/server"
import { getAgentByOnChainId } from "@/lib/db/repositories/agents"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agentId = Number(id)
  if (!Number.isFinite(agentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  const agent = await getAgentByOnChainId(agentId)
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(agent.rank_history ?? [])
}
