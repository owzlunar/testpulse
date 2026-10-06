import { type RequestHandler, Router } from 'express'
import { authenticate, requireAdmin } from '#core/auth/guards.js'
import { ApiError } from '#core/http/errors.js'
import { validate } from '#core/http/validate.js'
import { isAgentToken } from './backup.agent-client.js'
import { backupController as c } from './backup.controller.js'
import { backupValidation as v } from './backup.validation.js'

// Backup & recovery: the built-in Admin only. The agent's alerts come in with its own token (no user).
export const backupRouter = Router()

const admin = [authenticate, requireAdmin]
const agentOnly: RequestHandler = (req, _res, next) =>
  next(isAgentToken(req.get('authorization')) ? undefined : ApiError.unauthorized('token ของ agent ไม่ถูกต้อง'))

backupRouter.get('/backup/status', ...admin, c.status)
backupRouter.get('/backup/jobs', ...admin, c.jobs)
backupRouter.get('/backup/jobs/:id/log', ...admin, validate(v.jobId), c.jobLog)
backupRouter.post('/backup/jobs', ...admin, validate(v.start), c.start)
backupRouter.get('/backup/snapshots', ...admin, c.snapshots)
backupRouter.get('/backup/settings', ...admin, c.settings)
backupRouter.put('/backup/settings', ...admin, validate(v.settings), c.saveSettings)
backupRouter.post('/backup/alerts/test', ...admin, c.testAlerts)
backupRouter.post('/backup/agent-events', agentOnly, validate(v.agentEvent), c.agentEvent)
