import { Router } from 'express'
import { authenticate, requireAdmin } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { teamController } from './team.controller.js'
import { teamValidation } from './team.validation.js'

// Every signed-in user reads teams; only the Admin changes them.
export const teamRouter = Router()

teamRouter.get('/teams', authenticate, teamController.list)
teamRouter.post('/teams', authenticate, requireAdmin, validate(teamValidation.create), teamController.create)
teamRouter.put('/teams/:id', authenticate, requireAdmin, validate(teamValidation.update), teamController.update)
teamRouter.delete('/teams/:id', authenticate, requireAdmin, validate(teamValidation.remove), teamController.remove)
