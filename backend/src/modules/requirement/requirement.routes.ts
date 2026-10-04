import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { requirementController } from './requirement.controller.js'
import { requirementValidation } from './requirement.validation.js'

// Read with requirement.view (lists hold only projects the user may open); changes need
// requirement.edit / requirement.delete and access to the project (checked in the service).
export const requirementRouter = Router()

requirementRouter.get('/requirements', authenticate, requirementController.list)
requirementRouter.get('/requirements/search', authenticate, validate(requirementValidation.search), requirementController.search)
requirementRouter.post(
  '/projects/:projectId/requirements',
  authenticate,
  requireRole,
  validate(requirementValidation.create),
  requirementController.create,
)
requirementRouter.post(
  '/projects/:projectId/requirements/import',
  authenticate,
  requireRole,
  validate(requirementValidation.import),
  requirementController.importMany,
)
requirementRouter.put('/requirements/:id', authenticate, requireRole, validate(requirementValidation.update), requirementController.update)
requirementRouter.delete('/requirements/:id', authenticate, requireRole, validate(requirementValidation.remove), requirementController.remove)
