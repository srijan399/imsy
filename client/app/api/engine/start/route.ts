import { NextRequest, NextResponse } from "next/server"
import { runEngineTick } from "@/lib/engine/tick"
import { acquireLock } from "@/lib/db/locks"
import { requireAdmin } from "@/lib/auth/admin"

const LOCK_NAME = "engine_tick"
const LOCK_TTL_MS = 5 * 60 * 1000

/**
 * Compatibility shim for the legacy `{ action: "tick" }` payload.
 * The new canonical endpoint is `POST /api/engine/tick`. Both are admin-gated
 * and run a single tick — there is no in-process scheduler anymore.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let action = "tick"
  try {
    const body = await req.json()
    if (body?.action) action = String(body.action)
  } catch {
    // Empty body is fine — default to tick.
  }

  if (action === "stop") {
    return NextResponse.json({ status: "noop", note: "engine no longer runs an interval; ticks are explicit" })
  }

  if (action === "start" || action === "tick") {
    const release = await acquireLock(LOCK_NAME, { ttlMs: LOCK_TTL_MS, holder: "api/engine/start" })
    if (!release) {
      return NextResponse.json({ error: "Engine tick already running" }, { status: 409 })
    }
    try {
      const summary = await runEngineTick()
      return NextResponse.json({ status: "tick_complete", ...summary })
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 500 })
    } finally {
      await release()
    }
  }

  return NextResponse.json({ error: "action must be tick (or legacy: start, stop)" }, { status: 400 })
}

export async function GET() {
  return NextResponse.json({
    status: "manual",
    note: "Trigger a tick with POST /api/engine/tick (admin-gated). The interval scheduler has been removed.",
  })
}
