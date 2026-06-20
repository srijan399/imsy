import { NextRequest, NextResponse } from "next/server"
import { runEngineTick } from "@/lib/engine/tick"
import { acquireLock } from "@/lib/db/locks"
import { requireAdmin } from "@/lib/auth/admin"

const LOCK_NAME = "engine_tick"
const LOCK_TTL_MS = 5 * 60 * 1000

/**
 * Run exactly one engine tick. Admin-gated via `x-admin-token`. Concurrency-safe
 * via a Mongo-backed lock keyed by `engine_tick`. Returns aggregate counts so
 * dashboards / curl can confirm what happened.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const release = await acquireLock(LOCK_NAME, { ttlMs: LOCK_TTL_MS, holder: "api/engine/tick" })
  if (!release) {
    return NextResponse.json({ error: "Engine tick already running" }, { status: 409 })
  }

  const startedAt = Date.now()
  try {
    const summary = await runEngineTick()
    return NextResponse.json({
      status: "tick_complete",
      duration_ms: Date.now() - startedAt,
      ...summary,
    })
  } catch (error) {
    return NextResponse.json(
      { status: "tick_failed", error: (error as Error).message, duration_ms: Date.now() - startedAt },
      { status: 500 },
    )
  } finally {
    await release()
  }
}
