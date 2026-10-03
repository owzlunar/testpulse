import type { Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { created, send } from '#core/http/response.js'
import { defectService, type DefectFields } from './defect.service.js'

/** empty strings from the form mean "none" */
const clean = (body: DefectFields): DefectFields => ({ ...body, caseId: body.caseId || undefined, runId: body.runId || undefined })

export const defectController = {
  /** GET /defects */
  list: async (_req: Request, res: Response) => send(res, await defectService.list(principal())),
  /** POST /projects/:projectId/defects */
  create: async (req: Request, res: Response) =>
    created(res, await defectService.create(principal(), req.params.projectId as string, clean(req.body))),
  /** PUT /defects/:id */
  update: async (req: Request, res: Response) => send(res, await defectService.update(principal(), req.params.id as string, clean(req.body))),
  /** POST /defects/:id/comments */
  comment: async (req: Request, res: Response) =>
    send(res, await defectService.comment(principal(), req.params.id as string, (req.body as { text: string }).text)),
}
