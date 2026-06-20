import { NextRequest, NextResponse } from "next/server"
import { listAgentsByLeague } from "@/lib/db/repositories/agents"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  return NextResponse.json(await listAgentsByLeague(leagueId))
}
