import { NextRequest, NextResponse } from "next/server"
import { listBetsByWallet } from "@/lib/db/repositories/bets"

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")
  if (!wallet) return NextResponse.json({ error: "wallet param required" }, { status: 400 })
  return NextResponse.json(await listBetsByWallet(wallet))
}
