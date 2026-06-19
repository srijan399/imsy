import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { SeasonModel } from "@/lib/db/models/Season"
import { LeagueModel } from "@/lib/db/models/League"
import { MarketModel } from "@/lib/db/models/Market"
import { deriveSeasonStatusFromTimestamps } from "@/lib/db/status"

export type SeasonStatus = "upcoming" | "registration" | "active" | "ended" | "settled"

async function ensureSeasonStatusUpToDate<
  T extends {
    chain_id_hex: string
    status: SeasonStatus
    registration_start: Date
    season_start: Date
    season_end: Date
  },
>(season: T): Promise<T> {
  const derived = deriveSeasonStatusFromTimestamps(season)
  if (derived === season.status) return season
  await updateSeasonStatus(season.chain_id_hex, derived)
  return { ...season, status: derived }
}

export async function listSeasons() {
  await connectMongo()
  const seasons = await SeasonModel.find().sort({ season_start: -1 }).lean().exec()
  const out: typeof seasons = []
  for (const season of seasons) {
    out.push(await ensureSeasonStatusUpToDate(season))
  }
  return out
}

export async function getSeasonByChainId(chainIdHex: string) {
  await connectMongo()
  const season = await SeasonModel.findOne({ chain_id_hex: chainIdHex.toLowerCase() }).lean().exec()
  if (!season) return null
  return ensureSeasonStatusUpToDate(season)
}

export async function createSeason(input: {
  chain_id_hex: string
  name: string
  slug: string
  description?: string
  registration_start: Date
  registration_end: Date
  season_start: Date
  season_end: Date
  betting_lock_hours_before_end?: number
  created_by_wallet: string
  tx_hash: string
  created_on_chain_at: Date
  status?: SeasonStatus
}) {
  await connectMongo()
  const derived = deriveSeasonStatusFromTimestamps(
    {
      status: input.status,
      registration_start: input.registration_start,
      season_start: input.season_start,
      season_end: input.season_end,
    },
    new Date(),
  )
  const doc = new SeasonModel({
    ...input,
    chain_id_hex: input.chain_id_hex.toLowerCase(),
    created_by_wallet: input.created_by_wallet.toLowerCase(),
    description: input.description ?? "",
    status: input.status ?? derived,
    betting_lock_hours_before_end: input.betting_lock_hours_before_end ?? 6,
  })
  await doc.save()
  return doc.toObject()
}

export async function updateSeasonStatus(chainIdHex: string, status: SeasonStatus) {
  await connectMongo()
  const season = await SeasonModel.findOneAndUpdate(
    { chain_id_hex: chainIdHex.toLowerCase() },
    { status },
    { returnDocument: "after" },
  ).lean().exec()
  if (!season) throw new Error("Season not found")

  if (status === "active") {
    await LeagueModel.updateMany({ season_chain_id_hex: chainIdHex.toLowerCase() }, { status: "active" })
    // Markets are created as `pending` when the season isn't active yet.
    // When a season transitions to active, flip pending markets to open so
    // betting + bet indexing behave consistently.
    await MarketModel.updateMany(
      { season_chain_id_hex: chainIdHex.toLowerCase(), status: "pending" },
      { status: "open" },
    )
  } else if (status === "ended" || status === "settled") {
    await LeagueModel.updateMany({ season_chain_id_hex: chainIdHex.toLowerCase() }, { status: "ended" })
    await MarketModel.updateMany(
      { season_chain_id_hex: chainIdHex.toLowerCase(), status: { $in: ["open", "pending"] } },
      { status: "locked", locked_at: new Date() },
    )
  } else {
    // upcoming / registration
    await LeagueModel.updateMany({ season_chain_id_hex: chainIdHex.toLowerCase() }, { status: "upcoming" })
    await MarketModel.updateMany(
      { season_chain_id_hex: chainIdHex.toLowerCase(), status: "open" },
      { status: "pending" },
    )
  }

  return season
}

export async function updateSeasonBettingLockHours(chainIdHex: string, hours: number) {
  await connectMongo()
  if (!Number.isFinite(hours) || hours < 0 || hours > 168) {
    throw new Error("betting_lock_hours_before_end must be a number between 0 and 168")
  }
  const season = await SeasonModel.findOneAndUpdate(
    { chain_id_hex: chainIdHex.toLowerCase() },
    { betting_lock_hours_before_end: hours },
    { returnDocument: "after" },
  )
    .lean()
    .exec()
  if (!season) throw new Error("Season not found")
  return season
}
