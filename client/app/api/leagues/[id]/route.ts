import { NextRequest, NextResponse } from "next/server"
import { getLeagueWithAgents } from "@/lib/db/repositories/leagues"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { league, agents } = await getLeagueWithAgents(id)
  if (!league) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ league, agents })
}
