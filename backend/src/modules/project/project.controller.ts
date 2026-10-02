import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { created, done, send } from '#core/http/response.js'
import { projectService, type ProjectFields } from './project.service.js'

export const projectController = {
  /** GET /projects (only the ones the user may open), each with its case counts */
  list: async (_req: Request, res: Response) => send(res, await projectService.list(principal())),
  /** POST /projects */
  create: async (req: Request, res: Response) => created(res, await projectService.create(req.body as ProjectFields)),
  /** PUT /projects/:id */
  update: async (req: Request, res: Response) => send(res, await projectService.update(req.params.id as string, req.body as ProjectFields)),
  /** DELETE /projects/:id */
  remove: async (req: Request, res: Response) => {
    await projectService.remove(req.params.id as string)
    return done(res)
  },
}
