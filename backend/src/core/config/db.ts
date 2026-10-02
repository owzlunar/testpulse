import mongoose from 'mongoose'
import { config } from './env.js'
import { logger } from './logger.js'

// Indexes come from migrations in production (autoIndex off); development and tests build them on start.
mongoose.set('strictQuery', true)

export async function connectDatabase(uri = config.mongo.uri): Promise<typeof mongoose> {
  const connection = await mongoose.connect(uri, { autoIndex: !config.isProduction, serverSelectionTimeoutMS: 5000 })
  logger.info(`MongoDB connected (${connection.connection.name})`)
  return connection
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close()
}

/** true while the connection is up (readiness probe) */
export const databaseReady = () => mongoose.connection.readyState === mongoose.ConnectionStates.connected
