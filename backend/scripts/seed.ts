import { appModules } from '../src/app-modules.js'
import { connectDatabase, disconnectDatabase } from '#core/config/db.js'
import { config } from '#core/config/env.js'
import { logger } from '#core/config/logger.js'

// Demo data of every module (same ids as the web app's mock data). Re-running resets the demo
// records it owns; other data is left alone. Never in production.

if (config.isProduction) {
  logger.error('Refusing to seed a production database')
  process.exit(1)
}

await connectDatabase()
try {
  for (const module of appModules) {
    for (const seed of module.seeds ?? []) {
      await seed.run()
      logger.info(`[seed] ${module.name}: ${seed.name}`)
    }
  }
} finally {
  await disconnectDatabase()
}
