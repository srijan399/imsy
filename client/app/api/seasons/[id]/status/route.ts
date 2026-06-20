import { NextRequest, NextResponse } from "next/server"
import { updateSeasonStatus } from "@/lib/db/repositories/seasons"
import { requireAdmin } from "@/lib/auth/admin"

const VALID = new Set(["upcoming", "registration", "active", "ended", "settled"])

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const { id } = await params
    const { status } = await req.json()
    if (!VALID.has(status)) throw new Error(`Invalid status. Must be one of: ${Array.from(VALID).join(", ")}`)
    const season = await updateSeasonStatus(id, status)
    return NextResponse.json(season)
  } catch (error) {
    const message = (error as Error).message
    const code = message.includes("not found") ? 404 : 400
    return NextResponse.json({ error: message }, { status: code })
  }
}
