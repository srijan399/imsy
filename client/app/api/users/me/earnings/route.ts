import { NextRequest, NextResponse } from "next/server"
import { listEarningsByWallet } from "@/lib/db/repositories/earnings"

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")
  if (!wallet) return NextResponse.json({ error: "wallet param required" }, { status: 400 })
  return NextResponse.json(await listEarningsByWallet(wallet))
}
