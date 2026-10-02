import { Router } from 'express'
import { authenticate, requireAdmin } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { roleController } from './role.controller.js'
import { roleValidation } from './role.validation.js'

// Every signed-in user reads roles (role labels show everywhere); only the Admin changes them.
export const roleRouter = Router()

roleRouter.get('/roles', authenticate, roleController.list)
roleRouter.post('/roles', authenticate, requireAdmin, validate(roleValidation.create), roleController.create)
roleRouter.put('/roles/:id', authenticate, requireAdmin, validate(roleValidation.update), roleController.update)
roleRouter.delete('/roles/:id', authenticate, requireAdmin, validate(roleValidation.remove), roleController.remove)
