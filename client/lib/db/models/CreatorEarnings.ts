import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const CreatorEarningsSchema = new Schema(
  {
    creator_wallet: { type: String, required: true, lowercase: true },
    agent_id: { type: Number, required: true },
    season_chain_id_hex: { type: String, required: true, lowercase: true },
    eligible_market_contracts: { type: [String], default: [] },
    total_fee_pool: { type: Number, required: true },
    creator_share_rate: { type: Number, required: true },
    earned_amount: { type: Number, required: true },
    tx_hash: { type: String, required: true },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    calculated_at: { type: Date, required: true },
    paid_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

CreatorEarningsSchema.index({ creator_wallet: 1, calculated_at: -1 })

export type CreatorEarningsDoc = InferSchemaType<typeof CreatorEarningsSchema>
export const CreatorEarningsModel =
  (mongoose.models.CreatorEarnings as mongoose.Model<CreatorEarningsDoc>) ??
  mongoose.model<CreatorEarningsDoc>("CreatorEarnings", CreatorEarningsSchema)
