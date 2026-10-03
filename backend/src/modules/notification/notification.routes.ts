import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { notificationController } from './notification.controller.js'
import { notificationValidation } from './notification.validation.js'

// Every person reads and tidies their own list (users without the receive permission get an empty
// one). Notifications to others are created by the server with the change, never posted.
export const notificationRouter = Router()

notificationRouter.get('/notifications', authenticate, notificationController.list)
notificationRouter.get('/notifications/stream', authenticate, notificationController.stream)
notificationRouter.post('/notifications', authenticate, requireRole, validate(notificationValidation.create), notificationController.create)
notificationRouter.post('/notifications/read-all', authenticate, notificationController.markAllRead)
notificationRouter.patch('/notifications/:id/read', authenticate, validate(notificationValidation.byId), notificationController.markRead)
notificationRouter.delete('/notifications/:id', authenticate, validate(notificationValidation.byId), notificationController.hide)
notificationRouter.delete('/notifications', authenticate, notificationController.hideAll)
