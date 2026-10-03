import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { runController } from './run.controller.js'
import { runValidation as v } from './run.validation.js'

// Rounds of execution: run.view to read; planning run.create, closing run.close, results run.execute,
// with access to the project (checked in the service).
export const runRouter = Router()

runRouter.get('/test-runs', authenticate, runController.list)
runRouter.post('/projects/:projectId/test-runs', authenticate, requireRole, validate(v.create), runController.create)
runRouter.patch('/test-runs/:id', authenticate, requireRole, validate(v.update), runController.update)
runRouter.put('/test-runs/:id/results/:caseId', authenticate, requireRole, validate(v.saveResult), runController.saveResult)
runRouter.delete('/test-runs/:id', authenticate, requireRole, validate(v.remove), runController.remove)
