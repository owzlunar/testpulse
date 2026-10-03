import type { Request, Response } from 'express'
import type { CaseExpectation, TestCaseInput, TestCaseOrder } from '#contract/types.js'
import { principal } from '#core/auth/guards.js'
import { created, send } from '#core/http/response.js'
import { testCaseService, type NewCaseInput } from './test-case.service.js'

const params = (req: Request) => req.params as { projectId: string; id: string; version: string }
const expectedOf = (req: Request) => (req.body as { expected?: CaseExpectation } | undefined)?.expected

export const testCaseController = {
  /** GET /projects/:projectId/test-cases */
  list: async (req: Request, res: Response) => send(res, await testCaseService.list(principal(), params(req).projectId)),
  /** GET /test-cases?search=:q&limit=:n&offset=:n */
  search: async (req: Request, res: Response) => {
    const { search, limit, offset } = req.query as unknown as { search: string; limit: number; offset: number }
    return send(res, await testCaseService.search(principal(), search, limit, offset))
  },
  /** POST /projects/:projectId/test-cases */
  create: async (req: Request, res: Response) =>
    created(res, await testCaseService.create(principal(), params(req).projectId, (req.body as { cases: NewCaseInput[] }).cases)),
  /** PATCH /projects/:projectId/test-cases/:id */
  update: async (req: Request, res: Response) => {
    const { projectId, id } = params(req)
    const { patch } = req.body as { patch: Partial<TestCaseInput> }
    return send(res, await testCaseService.update(principal(), projectId, id, patch, expectedOf(req)))
  },
  /** POST /projects/:projectId/test-cases/:id/versions/:version/restore */
  restoreVersion: async (req: Request, res: Response) => {
    const { projectId, id, version } = params(req)
    return send(res, await testCaseService.restoreVersion(principal(), projectId, id, version, expectedOf(req)))
  },
  /** POST /projects/:projectId/test-cases/:id/review */
  markReviewed: async (req: Request, res: Response) =>
    send(res, await testCaseService.markReviewed(principal(), params(req).projectId, params(req).id, expectedOf(req))),
  /** PATCH /projects/:projectId/test-cases/:id/due-date */
  extendDueDate: async (req: Request, res: Response) => {
    const { newDate, reason } = req.body as { newDate: string; reason: string }
    return send(res, await testCaseService.extendDueDate(principal(), params(req).projectId, params(req).id, newDate, reason, expectedOf(req)))
  },
  /** POST /projects/:projectId/test-cases/:id/archive */
  archive: async (req: Request, res: Response) =>
    send(res, await testCaseService.archive(principal(), params(req).projectId, params(req).id, expectedOf(req))),
  /** POST /projects/:projectId/test-cases/:id/restore */
  restore: async (req: Request, res: Response) =>
    send(res, await testCaseService.restore(principal(), params(req).projectId, params(req).id, expectedOf(req))),
  /** GET /projects/:projectId/test-cases/:id/impact */
  impact: async (req: Request, res: Response) => send(res, await testCaseService.impact(principal(), params(req).projectId, params(req).id)),
  /** DELETE /projects/:projectId/test-cases/:id */
  remove: async (req: Request, res: Response) =>
    send(res, await testCaseService.remove(principal(), params(req).projectId, params(req).id, expectedOf(req))),
  /** PUT /projects/:projectId/test-cases/order */
  reorder: async (req: Request, res: Response) => {
    const { order, uids } = req.body as { order: TestCaseOrder[]; uids?: Record<string, string> }
    return send(res, await testCaseService.reorder(principal(), params(req).projectId, order, uids))
  },
}
