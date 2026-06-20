import { NextRequest, NextResponse } from "next/server"
import { listTradesByAgent } from "@/lib/db/repositories/trades"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const agentId = Number(id)
  if (!Number.isFinite(agentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  return NextResponse.json(await listTradesByAgent(agentId, 100))
}
