import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { reportController } from './report.controller.js'
import { reportValidation as v } from './report.validation.js'

// report.view for a project's report, case.view to record an export of its cases; access to the
// project is checked in the service.
export const reportRouter = Router()

reportRouter.get('/projects/:projectId/report', authenticate, requireRole, validate(v.report), reportController.ofProject)
reportRouter.post('/projects/:projectId/exports', authenticate, requireRole, validate(v.export), reportController.recordExport)
