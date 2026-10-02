import type { Request, Response } from 'express'
import { created, send } from '#core/http/response.js'
import { teamService, type TeamFields } from './team.service.js'

export const teamController = {
  /** GET /teams */
  list: async (_req: Request, res: Response) => send(res, await teamService.list()),
  /** POST /teams */
  create: async (req: Request, res: Response) => created(res, await teamService.create(req.body as TeamFields)),
  /** PUT /teams/:id */
  update: async (req: Request, res: Response) => send(res, await teamService.update(req.params.id as string, req.body as TeamFields)),
  /** DELETE /teams/:id -> the projects that changed */
  remove: async (req: Request, res: Response) => send(res, await teamService.remove(req.params.id as string)),
}
