import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const EngineLockSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    locked_at: { type: Date, required: true },
    expires_at: { type: Date, required: true },
    holder: { type: String },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

EngineLockSchema.index({ name: 1 }, { unique: true })
// Mongo TTL: auto-clean stale locks if a process crashed without releasing.
EngineLockSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 })

export type EngineLockDoc = InferSchemaType<typeof EngineLockSchema>
export const EngineLockModel =
  (mongoose.models.EngineLock as mongoose.Model<EngineLockDoc>) ??
  mongoose.model<EngineLockDoc>("EngineLock", EngineLockSchema)
