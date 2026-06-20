import { NextRequest } from "next/server"
import { listAgentsByLeague } from "@/lib/db/repositories/agents"

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(await listAgentsByLeague(leagueId))}\n\n`))
        } catch {
          // SSE writes can race with disconnects; ignore
        }
      }

      await send()
      const interval = setInterval(send, 10000)
      req.signal.addEventListener("abort", () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
