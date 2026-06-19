import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const MarketSchema = new Schema(
  {
    contract_address: { type: String, required: true, unique: true, lowercase: true },
    league_chain_id_hex: { type: String, required: true, lowercase: true },
    season_chain_id_hex: { type: String, required: true, lowercase: true },
    agent_id: { type: Number, required: true }, // on-chain agentId
    tier: { type: Number, required: true },
    question: { type: String, required: true },
    deployment_tx_hash: { type: String, required: true },
    deployed_at: { type: Date, required: true },
    chain_id: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "open", "locked", "resolved"],
      default: "open",
    },
    yes_pool: { type: Number, default: 0 },
    no_pool: { type: Number, default: 0 },
    total_volume: { type: Number, default: 0 },
    yes_count: { type: Number, default: 0 },
    no_count: { type: Number, default: 0 },
    interaction_threshold_met: { type: Boolean, default: false },
    outcome: { type: String, enum: ["yes", "no", null], default: null },
    locked_at: { type: Date, default: null },
    resolved_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

MarketSchema.index({ league_chain_id_hex: 1 })
MarketSchema.index({ agent_id: 1 })

export type MarketDoc = InferSchemaType<typeof MarketSchema>
export const MarketModel = (mongoose.models.Market as mongoose.Model<MarketDoc>) ?? mongoose.model<MarketDoc>("Market", MarketSchema)
