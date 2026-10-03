import type { TestCaseDraft } from '@/types'

export type { DraftOptions } from '@/types'

export const DRAFT_KINDS: { value: NonNullable<TestCaseDraft['kind']>; label: string; tone: 'success' | 'error' | 'info'; icon: string }[] = [
  { value: 'positive', label: 'Positive', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'negative', label: 'Negative', tone: 'error', icon: 'tabler:circle-x' },
  { value: 'boundary', label: 'Boundary', tone: 'info', icon: 'tabler:arrows-horizontal' },
]

export const draftKindOf = (kind?: TestCaseDraft['kind']) => DRAFT_KINDS.find((k) => k.value === kind) ?? DRAFT_KINDS[0]
