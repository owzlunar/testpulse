import type { AiStatus, DraftOptions, TestCaseDraft } from '#contract/types.js'
import { assertCan } from '#core/auth/guards.js'
import type { Principal } from '#core/auth/principal.js'
import { ApiError } from '#core/http/errors.js'
import { draftProvider } from './ai.provider.js'

export const aiService = {
  /** GET /ai/status: whether a model is set up (the AI actions show only then) */
  status(): AiStatus {
    const provider = draftProvider()
    return provider ? { enabled: true, model: provider.model } : { enabled: false }
  },

  /** POST /ai/test-case-drafts: drafts for QA to review (nothing is saved); writing cases needs case.edit */
  async draft(p: Principal, requirement: string, options: DraftOptions): Promise<TestCaseDraft[]> {
    assertCan(p, 'case.edit')
    const provider = draftProvider()
    if (!provider) throw new ApiError(503, 'ยังไม่ได้ตั้งค่า AI บนเซิร์ฟเวอร์', 'ai_disabled')
    if (!options.positive && !options.negative && !options.boundary) throw ApiError.unprocessable('เลือกประเภทเคสอย่างน้อย 1 แบบ')
    return provider.draft(requirement, options)
  },
}
