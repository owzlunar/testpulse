import mongoose from 'mongoose'
import { appModules } from '../src/app-modules.js'
import { migrations } from '../src/migrations/index.js'
import { connectDatabase, disconnectDatabase } from '#core/config/db.js'
import { logger } from '#core/config/logger.js'
import { migrate } from '#core/database/migrations.js'

// The frontend's real-backend e2e suite (frontend/e2e-real) starts from known data: this empties the
// database in MONGODB_URI (only one named like a test database), builds the indexes, seeds the demo
// data and runs the migrations. Never against data you keep.

await connectDatabase()
try {
  const name = mongoose.connection.name
  if (!/test/i.test(name)) throw new Error(`refusing to reset "${name}": not a test database`)
  for (const collection of await mongoose.connection.db!.collections()) await collection.deleteMany({})
  for (const model of appModules.flatMap((m) => m.models ?? [])) await model.createIndexes()
  for (const seed of appModules.flatMap((m) => m.seeds ?? [])) await seed.run()
  await migrate(migrations)
  logger.info(`[e2e] ${name} reset and seeded`)
} finally {
  await disconnectDatabase()
}
