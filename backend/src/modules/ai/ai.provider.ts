import type { DraftOptions, TestCaseDraft } from '#contract/types.js'
import { config } from '#core/config/env.js'
import { ollamaProvider } from './ollama.provider.js'

/** a language model that drafts test cases from a requirement */
export interface DraftProvider {
  /** shown in GET /ai/status, e.g. "qwen2.5:14b" */
  readonly model: string
  draft(requirement: string, options: DraftOptions): Promise<TestCaseDraft[]>
}

let provider: DraftProvider | null = config.ai.provider === 'ollama' ? ollamaProvider({ ...config.ai.ollama, timeoutMs: config.ai.timeoutMs }) : null

/** the configured provider (AI_PROVIDER), or none: the AI actions stay hidden */
export const draftProvider = (): DraftProvider | null => provider

/** tests: a stand-in model (null = none) */
export function setDraftProvider(next: DraftProvider | null): void {
  provider = next
}
