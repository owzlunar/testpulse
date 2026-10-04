import type { Request, Response } from 'express'
import type { DocumentRequest, DocumentTemplate } from '#contract/types.js'
import { principal } from '#core/auth/guards.js'
import type { SearchRequest } from '#core/http/search.js'
import { created, done, send } from '#core/http/response.js'
import { documentService, type DocumentPatch } from './document.service.js'

/** an empty run means "every case of the project" */
const cleanRequest = (body: DocumentRequest): DocumentRequest => ({ ...body, options: { ...body.options, runId: body.options.runId || undefined } })

export const documentController = {
  /** GET /documents */
  list: async (_req: Request, res: Response) => send(res, await documentService.list(principal())),
  /** GET /documents/search?q=:q&limit=:n&offset=:n */
  search: async (req: Request, res: Response) => {
    const { q, limit, offset } = req.query as unknown as SearchRequest
    send(res, await documentService.search(principal(), q, limit, offset))
  },
  /** POST /documents */
  generate: async (req: Request, res: Response) => created(res, await documentService.generate(principal(), cleanRequest(req.body))),
  /** POST /documents/:id/regenerate */
  regenerate: async (req: Request, res: Response) => send(res, await documentService.regenerate(principal(), req.params.id as string)),
  /** PATCH /documents/:id */
  update: async (req: Request, res: Response) =>
    send(res, await documentService.update(principal(), req.params.id as string, req.body as DocumentPatch)),
  /** POST /documents/:id/signatures/:index */
  sign: async (req: Request, res: Response) => {
    const { decision, comment } = req.body as { decision: 'signed' | 'rejected'; comment: string }
    send(res, await documentService.sign(principal(), req.params.id as string, Number(req.params.index), decision, comment))
  },
  /** DELETE /documents/:id */
  remove: async (req: Request, res: Response) => {
    await documentService.remove(principal(), req.params.id as string)
    done(res)
  },
  /** GET /organization/document-template */
  template: async (_req: Request, res: Response) => send(res, await documentService.template()),
  /** PUT /organization/document-template */
  saveTemplate: async (req: Request, res: Response) => send(res, await documentService.saveTemplate(principal(), req.body as DocumentTemplate)),
}
