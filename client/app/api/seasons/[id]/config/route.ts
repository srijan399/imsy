import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin"
import { updateSeasonBettingLockHours } from "@/lib/db/repositories/seasons"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({} as any))
    const hours = Number(body?.betting_lock_hours_before_end)

    const season = await updateSeasonBettingLockHours(id, hours)
    return NextResponse.json(season)
  } catch (error) {
    const message = (error as Error).message
    const code = message.toLowerCase().includes("not found") ? 404 : 400
    return NextResponse.json({ error: message }, { status: code })
  }
}
