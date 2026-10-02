import { Router, type Request, type Response } from 'express'
import { authenticate, principal } from '#core/auth/guards.js'
import { send } from '#core/http/response.js'
import { auditLogService } from './audit-log.service.js'

// Entries are written by the server (audit plugin / recordAudit), never posted by clients.
const auditLogController = {
  /** GET /audit-logs */
  list: async (_req: Request, res: Response) => send(res, await auditLogService.list(principal())),
}

export const auditLogRouter = Router()
auditLogRouter.get('/audit-logs', authenticate, auditLogController.list)
