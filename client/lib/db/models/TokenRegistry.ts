import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const TokenRegistrySchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true },
    contract_address: { type: String, required: true, lowercase: true },
    asset_class: { type: String, enum: ["stable", "volatile", "peg"], required: true },
    base_price_usd: { type: Number, required: true },
    current_price_usd: { type: Number, required: true },
    previous_price_usd: { type: Number },
    last_change_pct: { type: Number, default: 0 },
    last_direction: { type: Number, enum: [-1, 1], default: 1 },
    last_updated: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

export type TokenRegistryDoc = InferSchemaType<typeof TokenRegistrySchema>
export const TokenRegistryModel =
  (mongoose.models.TokenRegistry as mongoose.Model<TokenRegistryDoc>) ??
  mongoose.model<TokenRegistryDoc>("TokenRegistry", TokenRegistrySchema)
