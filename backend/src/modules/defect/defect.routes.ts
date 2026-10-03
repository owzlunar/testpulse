import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { searchQuery } from '#core/http/search.js'
import { validate } from '#core/http/validate.js'
import { defectController } from './defect.controller.js'
import { defectValidation as v } from './defect.validation.js'

// defect.view to read; reporting, progress and comments need defect.report, closing / rejecting
// defect.resolve; access to the project is checked in the service.
export const defectRouter = Router()

defectRouter.get('/defects', authenticate, defectController.list)
defectRouter.get('/defects/search', authenticate, validate({ query: searchQuery }), defectController.search)
defectRouter.post('/projects/:projectId/defects', authenticate, requireRole, validate(v.create), defectController.create)
defectRouter.put('/defects/:id', authenticate, requireRole, validate(v.update), defectController.update)
defectRouter.post('/defects/:id/comments', authenticate, requireRole, validate(v.comment), defectController.comment)
