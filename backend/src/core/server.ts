import type { Server } from 'node:http'
import { appState } from './app-state.js'
import { createApp } from './app.js'
import { connectDatabase, disconnectDatabase } from './config/db.js'
import { config } from './config/env.js'
import { logger } from './config/logger.js'
import { closeEventStreams } from './http/event-stream.js'
import { startJobs, stopJobs } from './jobs/scheduler.js'
import type { AppModule } from './module.js'
import { assertPreflight } from './preflight.js'

// Start-up and graceful shutdown (SIGTERM from Docker / Kubernetes): stop taking work, finish
// in-flight requests, close the database; give up after 10 s.

const SHUTDOWN_TIMEOUT_MS = 10_000

export async function startServer(modules: AppModule[]): Promise<Server> {
  await connectDatabase()
  // MongoDB, storage, SMTP and the log folder must work before taking traffic
  await assertPreflight()
  const app = await createApp({ modules })
  startJobs(modules.flatMap((m) => m.jobs ?? []))

  const server = app.listen(config.port, config.host, () =>
    logger.info(`TestPulse API on ${config.host}:${config.port}${config.basePath}, public ${config.baseUrl} (${config.env})`),
  )

  const shutdown = (reason: string, exitCode: number) => {
    if (appState.shuttingDown) return
    appState.shuttingDown = true
    logger.info(`Shutting down (${reason})`)
    setTimeout(() => {
      logger.error('Shutdown took too long, exiting')
      process.exit(exitCode || 1)
    }, SHUTDOWN_TIMEOUT_MS).unref()
    void stopJobs()
    // open event streams would hold the server open until the timeout
    closeEventStreams()
    server.closeIdleConnections()
    server.close(async () => {
      await disconnectDatabase().catch((err: Error) => logger.error(`Closing MongoDB failed: ${err.message}`))
      process.exit(exitCode)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM', 0))
  process.on('SIGINT', () => shutdown('SIGINT', 0))
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason })
    shutdown('unhandledRejection', 1)
  })
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack })
    shutdown('uncaughtException', 1)
  })
  return server
}
