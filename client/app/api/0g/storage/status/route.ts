import { NextResponse } from "next/server"
import { getZGConfig } from "@/lib/0g/config"

export async function GET() {
  const config = getZGConfig()
  return NextResponse.json({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    storageIndexer: config.storageIndexer,
    explorerUrl: config.explorerUrl,
    hasPrivateKey: Boolean(config.privateKey),
    require0G: process.env.IMSY_REQUIRE_0G === "true",
  })
}
