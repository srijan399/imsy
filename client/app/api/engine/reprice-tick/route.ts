import { NextRequest, NextResponse } from "next/server"
import { runRepriceTick } from "@/lib/engine/reprice"
import { acquireLock } from "@/lib/db/locks"
import { requireAdmin } from "@/lib/auth/admin"

const LOCK_NAME = "reprice_tick"
const LOCK_TTL_MS = 5 * 60 * 1000

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const release = await acquireLock(LOCK_NAME, { ttlMs: LOCK_TTL_MS, holder: "api/engine/reprice-tick" })
  if (!release) {
    return NextResponse.json({ error: "Reprice tick already running" }, { status: 409 })
  }

  try {
    const summary = await runRepriceTick()
    return NextResponse.json({ status: "reprice_complete", ...summary })
  } catch (error) {
    return NextResponse.json({ status: "reprice_failed", error: (error as Error).message }, { status: 500 })
  } finally {
    await release()
  }
}
