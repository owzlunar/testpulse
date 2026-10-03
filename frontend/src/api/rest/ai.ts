import type { AiApi } from '@/api/contract'
import type { AiStatus, TestCaseDraft } from '@/types'
import { get, post } from './http'

// Drafts come from the server's language model (a local Ollama); it may take a while to answer.
export const aiApi: AiApi = {
  fetchAiStatus: () => get<AiStatus>('/ai/status'),
  draftTestCases: (requirement, options) => post<TestCaseDraft[]>('/ai/test-case-drafts', { requirement, options }),
}
