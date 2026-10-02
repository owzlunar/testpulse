import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { runWithContext } from './context.js'

// Every request gets an id (kept from X-Request-Id when it looks sane, so a log line can't be forged)
// and runs inside a request context the rest of the app reads.

const VALID_ID = /^[\w.-]{8,64}$/

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id')?.trim()
  const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID()
  res.setHeader('X-Request-Id', id)
  runWithContext({ requestId: id, ip: req.ip, userAgent: req.get('user-agent') }, next)
}
