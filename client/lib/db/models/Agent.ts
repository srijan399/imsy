import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const RankHistorySchema = new Schema(
  {
    timestamp: { type: Date, required: true },
    rank: { type: Number, required: true },
    roi_pct: { type: Number, required: true },
  },
  { _id: false },
)

const AgentSchema = new Schema(
  {
    agent_id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    owner_wallet: { type: String, required: true, lowercase: true },
    leagues: { type: [String], default: [] }, // chain leagueId hex
    season_chain_id_hex: { type: String, lowercase: true },
    strategy: {
      description: { type: String, default: "" },
      playbook: {
        prime_directive: { type: String, required: true },
        trading_style: { type: String, required: true },
        entry_rules: { type: [String], required: true },
        exit_rules: { type: [String], required: true },
        risk_rules: { type: [String], required: true },
        sizing_rules: { type: [String], required: true },
        disallowed_actions: { type: [String], required: true },
        evaluation_notes: { type: String, default: "" },
      },
      strategy_root: { type: String, required: true, lowercase: true },
      sha256_hash: { type: String },
      zg_storage_status: { type: String, enum: ["uploaded", "local_hash_only"] },
      zg_storage_tx_hash: { type: String },
      zg_storage_error: { type: String },
      risk_profile: {
        max_drawdown_pct: { type: Number, default: 20 },
        max_position_size_pct: { type: Number, default: 30 },
        leverage_cap: { type: Number, default: 1 },
      },
      allowed_signals: { type: [String], default: [] },
      asset_universe: { type: [String], default: [] },
      version: { type: Number, default: 1 },
    },
    deposit_usd: { type: String, required: true }, // 1e18-scaled sUSD
    deploy_tx_hash: { type: String, required: true },
    icon: { type: String, required: true },
    color: { type: String, required: true, lowercase: true },
    status: {
      type: String,
      enum: ["registered", "active", "disqualified", "completed", "paused"],
      default: "registered",
    },
    performance: {
      roi_pct: { type: Number, default: 0 },
      sharpe_ratio: { type: Number, default: 0 },
      max_drawdown_pct: { type: Number, default: 0 },
      consistency_score: { type: Number, default: 0 },
      trade_count: { type: Number, default: 0 },
      win_rate: { type: Number, default: 0 },
    },
    current_rank: { type: Number, default: 1 },
    rank_history: { type: [RankHistorySchema], default: [] },
    prompt_locked_at: { type: Date, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

AgentSchema.index({ owner_wallet: 1 })
AgentSchema.index({ leagues: 1 })

export type AgentDoc = InferSchemaType<typeof AgentSchema>
export const AgentModel = (mongoose.models.Agent as mongoose.Model<AgentDoc>) ?? mongoose.model<AgentDoc>("Agent", AgentSchema)
