import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import type { SearchRequest } from '#core/http/search.js'
import { created, send } from '#core/http/response.js'
import { defectService, type DefectFields } from './defect.service.js'

/** empty strings from the form mean "none" */
const clean = (body: DefectFields): DefectFields => ({ ...body, caseId: body.caseId || undefined, runId: body.runId || undefined })

export const defectController = {
  /** GET /defects */
  list: async (_req: Request, res: Response) => send(res, await defectService.list(principal())),
  /** GET /defects/search?q=:q&limit=:n&offset=:n */
  search: async (req: Request, res: Response) => {
    const { q, limit, offset } = req.query as unknown as SearchRequest
    send(res, await defectService.search(principal(), q, limit, offset))
  },
  /** POST /projects/:projectId/defects */
  create: async (req: Request, res: Response) =>
    created(res, await defectService.create(principal(), req.params.projectId as string, clean(req.body))),
  /** PUT /defects/:id */
  update: async (req: Request, res: Response) => send(res, await defectService.update(principal(), req.params.id as string, clean(req.body))),
  /** POST /defects/:id/comments */
  comment: async (req: Request, res: Response) =>
    send(res, await defectService.comment(principal(), req.params.id as string, (req.body as { text: string }).text)),
}
