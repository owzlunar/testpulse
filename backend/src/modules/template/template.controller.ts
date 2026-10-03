import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { created, done, send } from '#core/http/response.js'
import { templateService, type TemplateFields } from './template.service.js'

export const templateController = {
  /** GET /test-case-templates */
  list: async (_req: Request, res: Response) => send(res, await templateService.list()),
  /** POST /test-case-templates */
  create: async (req: Request, res: Response) => created(res, await templateService.create(principal(), req.body as TemplateFields)),
  /** POST /test-case-templates/:id/use */
  markUsed: async (req: Request, res: Response) => {
    await templateService.markUsed(req.params.id as string)
    return done(res)
  },
  /** DELETE /test-case-templates/:id */
  remove: async (req: Request, res: Response) => {
    await templateService.remove(req.params.id as string)
    return done(res)
  },
}
