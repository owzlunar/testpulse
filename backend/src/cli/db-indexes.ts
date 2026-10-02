import { appModules } from '../app-modules.js'
import { connectDatabase, disconnectDatabase } from '#core/config/db.js'
import { logger } from '#core/config/logger.js'

// Builds the indexes every module's models declare (production runs with autoIndex off, so run this
// on deploy, before the new version takes traffic). Indexes no schema declares any more are only
// reported; `--drop-stale` removes them.

const dropStale = process.argv.includes('--drop-stale')

await connectDatabase()
try {
  for (const module of appModules) {
    for (const model of module.models ?? []) {
      await model.createCollection().catch(() => undefined)
      await model.createIndexes()
      const { toDrop } = await model.diffIndexes()
      if (toDrop.length && dropStale) await model.syncIndexes()
      const stale = toDrop.length ? ` (stale: ${toDrop.join(', ')}${dropStale ? ', dropped' : ''})` : ''
      logger.info(`[indexes] ${module.name}: ${model.collection.collectionName}${stale}`)
    }
  }
} finally {
  await disconnectDatabase()
}
