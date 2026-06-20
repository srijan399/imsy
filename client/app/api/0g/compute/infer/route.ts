import { NextRequest, NextResponse } from "next/server"
import { runVerifiedInference } from "@/lib/0g/compute"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const prompt = String(body.prompt ?? "").trim()
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 })

    const result = await runVerifiedInference({
      messages: [
        {
          role: "system",
          content: "You are IMSY 0G Compute. Produce concise, verifiable trading-agent output.",
        },
        { role: "user", content: prompt },
      ],
    })

    return NextResponse.json(result, { status: result.status === "failed" ? 503 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const status = message.startsWith("[0g-compute]") || message.startsWith("[0g]") ? 400 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
