import { migrations } from '../migrations/index.js'
import { connectDatabase, disconnectDatabase } from '#core/config/db.js'
import { logger } from '#core/config/logger.js'
import { migrate, migrationStatus } from '#core/database/migrations.js'

// node dist/cli/migrate.js [up|status]   (npm run migrate / migrate:status)
// The container runs `up` on every start, after the indexes (docker/entrypoint.sh).

const command = process.argv[2] ?? 'up'
try {
  await connectDatabase()
  if (command === 'status') {
    for (const m of await migrationStatus(migrations)) {
      logger.info(`[migrate] ${m.appliedAt ? `applied ${m.appliedAt.toISOString()}` : 'PENDING'}  ${m.id}: ${m.description}`)
    }
  } else if (command === 'up') {
    const applied = await migrate(migrations)
    logger.info(applied.length ? `[migrate] applied ${applied.length}: ${applied.join(', ')}` : '[migrate] up to date')
  } else {
    throw new Error(`unknown command "${command}" (up | status)`)
  }
} catch (err) {
  logger.error(`[migrate] ${(err as Error).message}`)
  process.exitCode = 1
} finally {
  await disconnectDatabase().catch(() => undefined)
}
