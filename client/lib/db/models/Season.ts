import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const SeasonSchema = new Schema(
  {
    chain_id_hex: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["upcoming", "registration", "active", "ended", "settled"],
      default: "upcoming",
    },
    registration_start: { type: Date, required: true },
    registration_end: { type: Date, required: true },
    season_start: { type: Date, required: true },
    season_end: { type: Date, required: true },
    betting_lock_hours_before_end: { type: Number, default: 3 },
    created_by_wallet: { type: String, required: true, lowercase: true },
    tx_hash: { type: String, required: true },
    created_on_chain_at: { type: Date, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

SeasonSchema.index({ chain_id_hex: 1 }, { unique: true })

export type SeasonDoc = InferSchemaType<typeof SeasonSchema>
export const SeasonModel = (mongoose.models.Season as mongoose.Model<SeasonDoc>) ?? mongoose.model<SeasonDoc>("Season", SeasonSchema)
