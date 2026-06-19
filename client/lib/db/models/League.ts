import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const LeagueSchema = new Schema(
  {
    chain_id_hex: { type: String, required: true, unique: true, lowercase: true },
    season_chain_id_hex: { type: String, required: true, lowercase: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["high_risk", "stable_alpha", "news_reactive", "macro", "speed", "custom"],
      default: "custom",
    },
    asset_universe: { type: [String], default: [] },
    initial_capital: { type: Number, default: 1000 },
    max_drawdown_pct: { type: Number, default: 20 },
    allowed_signals: { type: [String], default: [] },
    max_leverage: { type: Number, default: 1 },
    agent_count: { type: Number, default: 0 },
    status: { type: String, enum: ["upcoming", "active", "ended"], default: "upcoming" },
    tx_hash: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

LeagueSchema.index({ season_chain_id_hex: 1 })

export type LeagueDoc = InferSchemaType<typeof LeagueSchema>
export const LeagueModel = (mongoose.models.League as mongoose.Model<LeagueDoc>) ?? mongoose.model<LeagueDoc>("League", LeagueSchema)
