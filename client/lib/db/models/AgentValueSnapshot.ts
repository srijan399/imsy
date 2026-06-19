import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const AgentValueSnapshotSchema = new Schema(
  {
    agent_id: { type: Number, required: true },
    league_chain_id_hex: { type: String, required: true, lowercase: true },
    timestamp: { type: Date, required: true, default: Date.now },
    cash_usd: { type: String, required: true },          // 1e18-scaled
    position_value_usd: { type: String, required: true },// 1e18-scaled
    total_value_usd: { type: String, required: true },   // 1e18-scaled
    pnl_pct: { type: Number, required: true },           // % from registration deposit
    snapshot_kind: {
      type: String,
      enum: ["engine_tick", "reprice_tick", "registration"],
      required: true,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

AgentValueSnapshotSchema.index({ league_chain_id_hex: 1, timestamp: -1 })
AgentValueSnapshotSchema.index({ agent_id: 1, timestamp: -1 })
// TTL: prune after 7 days so the collection stays bounded.
AgentValueSnapshotSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 })

export type AgentValueSnapshotDoc = InferSchemaType<typeof AgentValueSnapshotSchema>
export const AgentValueSnapshotModel =
  (mongoose.models.AgentValueSnapshot as mongoose.Model<AgentValueSnapshotDoc>) ??
  mongoose.model<AgentValueSnapshotDoc>("AgentValueSnapshot", AgentValueSnapshotSchema)
