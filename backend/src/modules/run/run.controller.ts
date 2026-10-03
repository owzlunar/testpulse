import type { Request, Response } from 'express'
import type { TestRunInput } from '#contract/types.js'
import { principal } from '#core/auth/guards.js'
import { created, done, send } from '#core/http/response.js'
import { runService, type ResultInput, type RunFields } from './run.service.js'

export const runController = {
  /** GET /test-runs */
  list: async (_req: Request, res: Response) => send(res, await runService.list(principal())),
  /** POST /projects/:projectId/test-runs */
  create: async (req: Request, res: Response) =>
    created(res, await runService.create(principal(), req.params.projectId as string, req.body as Omit<TestRunInput, 'projectId'>)),
  /** PATCH /test-runs/:id */
  update: async (req: Request, res: Response) => send(res, await runService.update(principal(), req.params.id as string, req.body as RunFields)),
  /** PUT /test-runs/:id/results/:caseId */
  saveResult: async (req: Request, res: Response) =>
    send(
      res,
      await runService.saveResult(principal(), req.params.id as string, {
        ...(req.body as Omit<ResultInput, 'caseId'>),
        caseId: req.params.caseId as string,
      }),
    ),
  /** DELETE /test-runs/:id */
  remove: async (req: Request, res: Response) => {
    await runService.remove(principal(), req.params.id as string)
    return done(res)
  },
}
