import { NextRequest, NextResponse } from "next/server"
import { listAgentsByLeague } from "@/lib/db/repositories/agents"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(await listAgentsByLeague(id))
}
