import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { UserModel } from "@/lib/db/models/User"

export async function getUserByWallet(wallet: string) {
  await connectMongo()
  return UserModel.findOne({ wallet_address: wallet.toLowerCase() }).lean().exec()
}

export { ensureUser } from "./agents"
