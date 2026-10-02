import { Router } from 'express'
import { authenticate, requireAdmin } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { userController } from './user.controller.js'
import { userValidation } from './user.validation.js'

// Every signed-in user reads the user list (names and avatars show everywhere); only the Admin changes it.
// Public sign-up is POST /auth/register (auth module).
export const userRouter = Router()

userRouter.get('/users', authenticate, userController.list)
userRouter.post('/users', authenticate, requireAdmin, validate(userValidation.invite), userController.invite)
userRouter.patch('/users/:id', authenticate, requireAdmin, validate(userValidation.update), userController.update)
