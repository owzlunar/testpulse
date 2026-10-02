import { connectDatabase, disconnectDatabase } from '#core/config/db.js'
import { logger } from '#core/config/logger.js'
import { assertPreflight } from '#core/preflight.js'

// The container's start-up gate (docker/entrypoint.sh): exits 1 when MongoDB, storage, SMTP or
// the log folder doesn't work, so the container never starts half-configured.

try {
  try {
    await connectDatabase()
  } catch (err) {
    throw new Error(`database: cannot connect (${(err as Error).message})`, { cause: err })
  }
  await assertPreflight()
} catch (err) {
  logger.error(`[preflight] ${(err as Error).message}`)
  process.exitCode = 1
} finally {
  await disconnectDatabase().catch(() => undefined)
}
