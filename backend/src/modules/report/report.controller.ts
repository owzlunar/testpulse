import type { Request, Response } from 'express'
import type { ExportFormat } from '#contract/types.js'
import { principal } from '#core/auth/guards.js'
import { done, send } from '#core/http/response.js'
import { reportService } from './report.service.js'

export const reportController = {
  /** GET /projects/:projectId/report */
  ofProject: async (req: Request, res: Response) => send(res, await reportService.ofProject(principal(), req.params.projectId as string)),
  /** POST /projects/:projectId/exports */
  recordExport: async (req: Request, res: Response) => {
    const { format, filename } = req.body as { format: ExportFormat; filename: string }
    await reportService.recordExport(principal(), req.params.projectId as string, format, filename)
    done(res)
  },
}
