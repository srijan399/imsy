import { NextRequest, NextResponse } from "next/server"
import { listLeaguesBySeason } from "@/lib/db/repositories/leagues"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(await listLeaguesBySeason(id))
}
