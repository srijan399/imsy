import { NextRequest, NextResponse } from "next/server"
import { getUserByWallet } from "@/lib/db/repositories/users"

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")
  if (!wallet) return NextResponse.json({ error: "wallet param required" }, { status: 400 })

  const user = await getUserByWallet(wallet)
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  return NextResponse.json(user)
}
