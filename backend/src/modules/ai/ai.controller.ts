import type { Request, Response } from 'express'
import type { DraftOptions } from '#contract/types.js'
import { principal } from '#core/auth/guards.js'
import { send } from '#core/http/response.js'
import { aiService } from './ai.service.js'

export const aiController = {
  /** GET /ai/status */
  status: (_req: Request, res: Response) => send(res, aiService.status()),
  /** POST /ai/test-case-drafts */
  draft: async (req: Request, res: Response) => {
    const { requirement, options } = req.body as { requirement: string; options: DraftOptions }
    send(res, await aiService.draft(principal(), requirement, options))
  },
}
