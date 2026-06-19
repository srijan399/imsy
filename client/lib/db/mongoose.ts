import "server-only"

import mongoose from "mongoose"

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB = process.env.MONGODB_DB

if (!MONGODB_URI) {
  // Throwing here would crash imports of this module at load time on serverless
  // platforms; instead surface a clear error when a route actually tries to connect.
  console.warn("[mongo] MONGODB_URI is not set; calls to connectMongo() will fail.")
}

interface MongoCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

const globalForMongo = globalThis as typeof globalThis & { __imsyMongo?: MongoCache }
const cached: MongoCache = globalForMongo.__imsyMongo ?? { conn: null, promise: null }
globalForMongo.__imsyMongo = cached

export async function connectMongo() {
  if (cached.conn) return cached.conn

  if (!MONGODB_URI) throw new Error("[mongo] MONGODB_URI is required")

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB,
      bufferCommands: false,
      maxPoolSize: 10,
    })
  }

  cached.conn = await cached.promise
  return cached.conn
}
