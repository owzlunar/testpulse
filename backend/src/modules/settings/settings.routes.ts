import { Router, type Request, type Response } from 'express'
import Joi from 'joi'
import type { AppSettings } from '#contract/types.js'
import { authenticate, principal } from '#core/auth/guards.js'
import { send } from '#core/http/response.js'
import { validate } from '#core/http/validate.js'
import { settingsService } from './settings.service.js'

// The signed-in user's own preferences (open to users without a role too).
const settingsBody = Joi.object({
  alertOnModification: Joi.boolean().required(),
  alertOnStatusChange: Joi.boolean().required(),
  alertOnExpiry: Joi.boolean().required(),
  expiryDaysThreshold: Joi.number().integer().min(1).max(30).required(),
  obsidianFrontmatter: Joi.boolean().required(),
  obsidianCallouts: Joi.boolean().required(),
  obsidianWikilinks: Joi.boolean().required(),
  stickyPageHeader: Joi.boolean().required(),
})

const settingsController = {
  /** GET /me/settings */
  get: async (_req: Request, res: Response) => send(res, await settingsService.get(principal().id)),
  /** PUT /me/settings */
  save: async (req: Request, res: Response) => send(res, await settingsService.save(principal().id, req.body as AppSettings)),
}

export const settingsRouter = Router()
settingsRouter.get('/me/settings', authenticate, settingsController.get)
settingsRouter.put('/me/settings', authenticate, validate({ body: settingsBody }), settingsController.save)
