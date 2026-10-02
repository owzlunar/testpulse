import type { TestCaseDraft } from '@/types'

export interface DraftOptions {
  positive: boolean
  negative: boolean
  boundary: boolean
  /** extra context, e.g. platform or business rules */
  context?: string
}

// -----------------------------------------------------------------------------
// MOCK. The real backend sends the requirement to an LLM and returns drafts in
// the same `TestCaseDraft` shape. This stand-in picks a scenario pack by keyword
// so the review UI shows realistic, domain-specific results.
// -----------------------------------------------------------------------------

export const DRAFT_KINDS: { value: NonNullable<TestCaseDraft['kind']>; label: string; tone: 'success' | 'error' | 'info'; icon: string }[] = [
  { value: 'positive', label: 'Positive', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'negative', label: 'Negative', tone: 'error', icon: 'tabler:circle-x' },
  { value: 'boundary', label: 'Boundary', tone: 'info', icon: 'tabler:arrows-horizontal' },
]

export const draftKindOf = (kind?: TestCaseDraft['kind']) => DRAFT_KINDS.find((k) => k.value === kind) ?? DRAFT_KINDS[0]
