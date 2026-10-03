import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { requestContext } from '#core/http/context.js'
import { openEventStream } from '#core/http/event-stream.js'
import { created, done, send } from '#core/http/response.js'
import { assertOwnAudience, notificationService, STREAM_TOPIC, type OwnNotification } from './notification.service.js'

export const notificationController = {
  /** GET /notifications */
  list: async (_req: Request, res: Response) => send(res, await notificationService.list(principal())),
  /** GET /notifications/stream (server-sent events: `notification` = a new one for me, `changed` = reload the list) */
  stream: (req: Request, res: Response) => {
    openEventStream(req, res, { topic: STREAM_TOPIC, userId: principal().id, endsAt: requestContext()?.tokenExpiresAt })
  },
  /** POST /notifications (a confirmation to oneself) */
  create: async (req: Request, res: Response) => {
    const p = principal()
    assertOwnAudience(p, req.body.to)
    const { title, message, severity, projectId } = req.body as OwnNotification
    return created(res, await notificationService.createOwn(p, { title, message, severity, projectId }))
  },
  /** PATCH /notifications/:id/read */
  markRead: async (req: Request, res: Response) => {
    await notificationService.markRead(principal(), req.params.id as string)
    return done(res)
  },
  /** POST /notifications/read-all */
  markAllRead: async (_req: Request, res: Response) => {
    await notificationService.markAllRead(principal())
    return done(res)
  },
  /** DELETE /notifications/:id */
  hide: async (req: Request, res: Response) => {
    await notificationService.hide(principal(), req.params.id as string)
    return done(res)
  },
  /** DELETE /notifications */
  hideAll: async (_req: Request, res: Response) => {
    await notificationService.hideAll(principal())
    return done(res)
  },
}
