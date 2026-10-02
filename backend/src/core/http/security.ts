import cors from 'cors'
import type { Express, RequestHandler } from 'express'
import helmet from 'helmet'
import { config } from '../config/env.js'

/** removes `$operators` and dotted keys from client input (NoSQL injection), in place */
export function stripOperators(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) return value.forEach(stripOperators)
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) delete (value as Record<string, unknown>)[key]
    else stripOperators((value as Record<string, unknown>)[key])
  }
}

/** after the body parser: it cleans what the client sent (body, params, query) */
export const sanitizeInput: RequestHandler = (req, _res, next) => {
  stripOperators(req.body)
  stripOperators(req.params)
  // Express 5: req.query is a getter that re-parses; replace it with a cleaned copy
  const query = { ...req.query }
  stripOperators(query)
  Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true, enumerable: true })
  next()
}

/** browsers may call the API only from the web app (APP_URL) and CORS_ORIGINS */
export const allowedOrigins = () => [...new Set([config.appUrl, ...config.cors.origins])]

export function setupSecurity(app: Express): void {
  app.use(helmet())
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || allowedOrigins().includes(origin)),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      // the refresh token travels in an httpOnly cookie
      credentials: true,
    }),
  )
}
