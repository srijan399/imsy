import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const TradeLogSchema = new Schema(
  {
    agent_id: { type: Number, required: true },
    league_chain_id_hex: { type: String, required: true, lowercase: true },
    season_chain_id_hex: { type: String, lowercase: true },
    timestamp: { type: Date, required: true },
    action: { type: String, enum: ["buy", "sell", "hold"], required: true },
    asset: { type: String, required: true },
    quantity: { type: Number, required: true },
    price_usd: { type: String, required: true },
    success: { type: Boolean, required: true },
    simulated: { type: Boolean, required: true },
    dex_router: { type: String, default: null, lowercase: true },
    reason: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    portfolio_value_usd_after: { type: String, default: "0" },
    tx_hash: { type: String },
    reason_hash: { type: String, lowercase: true },
    zg_storage_ref: { type: String },
    zg_storage_status: { type: String, enum: ["uploaded", "local_hash_only"] },
    zg_storage_tx_hash: { type: String },
    zg_storage_error: { type: String },
    compute_ref: {
      model: { type: String },
      endpoint: { type: String },
      response_id: { type: String, default: null },
      tee_verified: { type: Boolean, default: false },
      status: { type: String, enum: ["verified", "unverified", "not_configured", "failed"] },
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

TradeLogSchema.index({ agent_id: 1, timestamp: -1 })
TradeLogSchema.index({ league_chain_id_hex: 1, timestamp: -1 })

export type TradeLogDoc = InferSchemaType<typeof TradeLogSchema>
export const TradeLogModel =
  (mongoose.models.TradeLog as mongoose.Model<TradeLogDoc>) ?? mongoose.model<TradeLogDoc>("TradeLog", TradeLogSchema)
