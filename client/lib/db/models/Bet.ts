import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const BetSchema = new Schema(
  {
    wallet_address: { type: String, required: true, lowercase: true },
    market_contract: { type: String, required: true, lowercase: true },
    agent_id: { type: Number, required: true },
    season_chain_id_hex: { type: String, required: true, lowercase: true },
    side: { type: String, enum: ["yes", "no"], required: true },
    stake: { type: Number, required: true },
    implied_odds_at_bet: { type: Number, default: 0 },
    tx_hash: { type: String, required: true, unique: true },
    tx_block_number: { type: Number },
    status: { type: String, enum: ["active", "won", "lost"], default: "active" },
    payout: { type: Number, default: null },
    placed_at: { type: Date, required: true },
    resolved_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

BetSchema.index({ wallet_address: 1 })
BetSchema.index({ market_contract: 1 })
BetSchema.index({ tx_hash: 1 }, { unique: true })

export type BetDoc = InferSchemaType<typeof BetSchema>
export const BetModel = (mongoose.models.Bet as mongoose.Model<BetDoc>) ?? mongoose.model<BetDoc>("Bet", BetSchema)
