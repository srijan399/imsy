import "server-only"

import type { SeasonStatus } from "@/lib/db/repositories/seasons"
import type { LeagueDoc } from "@/lib/db/models/League"

export function deriveSeasonStatusFromTimestamps(
  season: {
    status?: SeasonStatus
    registration_start: Date
    season_start: Date
    season_end: Date
  },
  now: Date = new Date(),
): SeasonStatus {
  // "settled" is a manual, terminal state.
  if (season.status === "settled") return "settled"

  const regStartMs = season.registration_start?.getTime?.()
  const seasonStartMs = season.season_start?.getTime?.()
  const seasonEndMs = season.season_end?.getTime?.()
  const nowMs = now.getTime()

  if (!Number.isFinite(regStartMs) || !Number.isFinite(seasonStartMs) || !Number.isFinite(seasonEndMs)) {
    return season.status ?? "upcoming"
  }

  if (nowMs < regStartMs) return "upcoming"
  if (nowMs < seasonStartMs) return "registration"
  if (nowMs < seasonEndMs) return "active"
  return "ended"
}

export function leagueStatusFromSeasonStatus(seasonStatus: SeasonStatus): LeagueDoc["status"] {
  if (seasonStatus === "active") return "active"
  if (seasonStatus === "ended" || seasonStatus === "settled") return "ended"
  return "upcoming"
}
