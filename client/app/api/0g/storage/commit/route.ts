import { NextRequest, NextResponse } from "next/server"
import { uploadJsonToZG } from "@/lib/0g/storage"

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => null)
    if (!payload) return NextResponse.json({ error: "JSON body required" }, { status: 400 })
    const commitment = await uploadJsonToZG(payload, "api-commit.json")
    return NextResponse.json(commitment, { status: commitment.status === "uploaded" ? 201 : 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message, status: "failed" }, { status: 500 })
  }
}
