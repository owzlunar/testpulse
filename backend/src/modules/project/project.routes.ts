import { Router } from 'express'
import { authenticate, requireAdmin } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { projectController } from './project.controller.js'
import { projectValidation } from './project.validation.js'

// A signed-in user lists the projects they may open (none without a role); only the Admin manages them.
export const projectRouter = Router()

projectRouter.get('/projects', authenticate, projectController.list)
projectRouter.post('/projects', authenticate, requireAdmin, validate(projectValidation.create), projectController.create)
projectRouter.put('/projects/:id', authenticate, requireAdmin, validate(projectValidation.update), projectController.update)
projectRouter.delete('/projects/:id', authenticate, requireAdmin, validate(projectValidation.remove), projectController.remove)
