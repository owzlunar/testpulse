import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { created, send } from '#core/http/response.js'
import { requirementService, type RequirementFields } from './requirement.service.js'

export const requirementController = {
  /** GET /requirements */
  list: async (_req: Request, res: Response) => send(res, await requirementService.list(principal())),
  /** GET /requirements/search?q=:q&limit=:n */
  search: async (req: Request, res: Response) => {
    const { q, limit } = req.query as unknown as { q: string; limit: number }
    return send(res, await requirementService.search(principal(), q, limit))
  },
  /** POST /projects/:projectId/requirements */
  create: async (req: Request, res: Response) =>
    created(res, await requirementService.create(principal(), req.params.projectId as string, req.body as RequirementFields)),
  /** PUT /requirements/:id */
  update: async (req: Request, res: Response) =>
    send(res, await requirementService.update(principal(), req.params.id as string, req.body as RequirementFields)),
  /** DELETE /requirements/:id */
  remove: async (req: Request, res: Response) => send(res, await requirementService.remove(principal(), req.params.id as string)),
}
