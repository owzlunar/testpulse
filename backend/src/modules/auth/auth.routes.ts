import { Router } from 'express'
import { authenticate, requireAdmin } from '#core/auth/guards.js'
import { authRateLimit } from '#core/http/rate-limit.js'
import { validate } from '#core/http/validate.js'
import { authController } from './auth.controller.js'
import { authValidation } from './auth.validation.js'

export const authRouter = Router()

// public (rate limited: password guessing, invite token guessing)
authRouter.post('/auth/login', authRateLimit, validate(authValidation.login), authController.login)
authRouter.post('/auth/register', authRateLimit, validate(authValidation.register), authController.register)
authRouter.post('/auth/refresh', authRateLimit, authController.refresh)
authRouter.post('/auth/logout', authController.logout)
authRouter.get('/auth/invites/:token', authRateLimit, validate(authValidation.inviteInfo), authController.inviteInfo)
authRouter.post('/auth/invites/:token/accept', authRateLimit, validate(authValidation.acceptInvite), authController.acceptInvite)

// signed in
authRouter.get('/auth/me', authenticate, authController.me)
authRouter.put('/me/password', authenticate, authRateLimit, validate(authValidation.changePassword), authController.changePassword)
authRouter.post('/users/:id/invite', authenticate, requireAdmin, validate(authValidation.resendInvite), authController.resendInvite)
