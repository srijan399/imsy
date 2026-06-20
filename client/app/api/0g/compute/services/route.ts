import { NextResponse } from "next/server"
import { listComputeServices } from "@/lib/0g/compute"

export async function GET() {
  try {
    const services = await listComputeServices()
    return NextResponse.json(services)
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message,
      },
      { status: 503 },
    )
  }
}
