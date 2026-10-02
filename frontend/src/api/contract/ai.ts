import type { TestCaseDraft } from '@/types'
import type { DraftOptions } from '@/domain/ai'

export interface AiApi {
  /**
   * POST /ai/test-case-drafts
   * Body: { requirement, options } → TestCaseDraft[] (QA reviews before saving)
   */
  draftTestCases(requirement: string, options: DraftOptions): Promise<TestCaseDraft[]>
}
