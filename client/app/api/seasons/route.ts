import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import { createSeason, listSeasons } from "@/lib/db/repositories/seasons"
import { verifySeasonOnChain, getFactoryOwner } from "@/lib/web3/server"

export async function GET() {
  return NextResponse.json(await listSeasons())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      chain_id_hex,
      name,
      slug,
      description,
      registration_start,
      registration_end,
      season_start,
      season_end,
      betting_lock_hours_before_end,
      created_by_wallet,
      tx_hash,
      created_on_chain_at,
      status,
    } = body ?? {}

    if (!chain_id_hex || typeof chain_id_hex !== "string") throw new Error("chain_id_hex required")
    if (!name || !slug) throw new Error("name and slug required")
    if (!season_start || !season_end) throw new Error("season_start and season_end required")
    if (!ethers.isAddress(created_by_wallet)) throw new Error("created_by_wallet invalid")
    if (!tx_hash) throw new Error("tx_hash required")

    if (!(await verifySeasonOnChain(chain_id_hex))) throw new Error("Season not found on-chain")
    if (!(await getFactoryOwner(created_by_wallet))) throw new Error("Caller is not a factory owner")

    // Duplicate name guard (case-insensitive)
    const { SeasonModel } = await import("@/lib/db/models/Season")
    const { connectMongo } = await import("@/lib/db/mongoose")
    await connectMongo()
    const existing = await SeasonModel.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).lean()
    if (existing) throw new Error(`A season named "${name}" already exists`)

    const season = await createSeason({
      chain_id_hex,
      name,
      slug,
      description: description ?? "",
      registration_start: new Date(registration_start ?? Date.now()),
      registration_end: new Date(registration_end ?? season_start),
      season_start: new Date(season_start),
      season_end: new Date(season_end),
      betting_lock_hours_before_end: betting_lock_hours_before_end ?? 6,
      created_by_wallet,
      tx_hash,
      created_on_chain_at: new Date(created_on_chain_at ?? Date.now()),
      status,
    })

    return NextResponse.json(season, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
