import "server-only"

import mongoose, { Schema, type InferSchemaType } from "mongoose"

const UserSchema = new Schema(
  {
    wallet_address: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true },
    role: { type: String, enum: ["bettor", "builder", "admin"], required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
)

export type UserDoc = InferSchemaType<typeof UserSchema>
export const UserModel = (mongoose.models.User as mongoose.Model<UserDoc>) ?? mongoose.model<UserDoc>("User", UserSchema)
