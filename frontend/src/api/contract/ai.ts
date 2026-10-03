import type { AiStatus, DraftOptions, TestCaseDraft } from '@/types'

export interface AiApi {
  /** GET /ai/status (the AI buttons show only when a model is set up) */
  fetchAiStatus(): Promise<AiStatus>

  /**
   * POST /ai/test-case-drafts
   * Body: { requirement, options } → TestCaseDraft[] (QA reviews before saving)
   */
  draftTestCases(requirement: string, options: DraftOptions): Promise<TestCaseDraft[]>
}
