import { NextRequest, NextResponse } from "next/server"
import { getMarket } from "@/lib/db/repositories/markets"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const market = await getMarket(id)
  if (!market) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(market)
}
