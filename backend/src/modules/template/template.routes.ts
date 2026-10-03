import { Router } from 'express'
import { authenticate, requirePermission, requireRole } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { templateController } from './template.controller.js'
import { templateValidation } from './template.validation.js'

// Every role reads templates; whoever writes cases (case.edit) adds, uses and deletes them.
export const templateRouter = Router()

templateRouter.get('/test-case-templates', authenticate, requireRole, templateController.list)
templateRouter.post(
  '/test-case-templates',
  authenticate,
  requirePermission('case.edit'),
  validate(templateValidation.create),
  templateController.create,
)
templateRouter.post(
  '/test-case-templates/:id/use',
  authenticate,
  requirePermission('case.edit'),
  validate(templateValidation.byId),
  templateController.markUsed,
)
templateRouter.delete(
  '/test-case-templates/:id',
  authenticate,
  requirePermission('case.edit'),
  validate(templateValidation.byId),
  templateController.remove,
)
