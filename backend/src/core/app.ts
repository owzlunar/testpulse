import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'
import morgan from 'morgan'
import { config } from './config/env.js'
import { logger } from './config/logger.js'
import { sanitizeUrl } from './config/redact.js'
import { requestContext } from './http/context.js'
import { errorHandler, notFoundHandler } from './http/error-handler.js'
import { healthRouter } from './http/health.js'
import { globalRateLimit } from './http/rate-limit.js'
import { requestId } from './http/request-id.js'
import { sanitizeInput, setupSecurity } from './http/security.js'
import { clearEventHandlers } from './events/event-bus.js'
import type { AppModule } from './module.js'

// The Express app for a list of modules (src/index.ts picks them; tests can pick fewer).
// Pipeline: request id -> access log -> health -> security / CORS -> rate limit -> body -> sanitize -> modules -> 404 -> errors

export async function createApp({ modules }: { modules: AppModule[] }): Promise<Express> {
  // modules (re-)register their event handlers, resolvers and sinks: building the app twice must not double them
  clearEventHandlers()
  for (const module of modules) await module.setup?.()

  const app = express()
  app.set('trust proxy', config.trustProxy)
  app.disable('x-powered-by')

  app.use(requestId)
  if (!config.isTest) {
    morgan.token('id', () => requestContext()?.requestId ?? '-')
    morgan.token('safe-url', (req) => sanitizeUrl((req as express.Request).originalUrl ?? req.url ?? ''))
    app.use(
      morgan('[:id] :method :safe-url :status :res[content-length] - :response-time ms', { stream: { write: (line) => logger.http(line.trim()) } }),
    )
  }

  app.use(healthRouter)
  if (config.basePath) app.use(config.basePath, healthRouter)

  setupSecurity(app)
  app.use(globalRateLimit)
  app.use(express.json({ limit: config.bodyLimit }))
  app.use(cookieParser())
  app.use(sanitizeInput)

  for (const module of modules) {
    if (!module.router) continue
    app.use(config.basePath || '/', module.router)
    logger.debug(`[app] module "${module.name}" mounted at ${config.basePath || '/'}`)
  }

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
