import { Router } from 'express'
import { authenticate, requireRole } from '#core/auth/guards.js'
import { validate } from '#core/http/validate.js'
import { aiController } from './ai.controller.js'
import { aiValidation as v } from './ai.validation.js'

// Whether AI is set up: anyone with a role; drafts need case.edit (checked in the service).
export const aiRouter = Router()

aiRouter.get('/ai/status', authenticate, requireRole, aiController.status)
aiRouter.post('/ai/test-case-drafts', authenticate, requireRole, validate(v.draft), aiController.draft)
