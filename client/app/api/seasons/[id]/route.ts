import { NextRequest, NextResponse } from "next/server"
import { getSeasonByChainId } from "@/lib/db/repositories/seasons"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const season = await getSeasonByChainId(id)
  if (!season) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(season)
}
