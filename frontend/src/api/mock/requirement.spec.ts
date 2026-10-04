import { describe, expect, it } from 'vitest'
import type { RequirementInput } from '@/types'
import { saveRequirement, searchRequirements } from './requirement'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// A requirement comes from a TOR clause or is added on top of the TOR

const input = (over: Partial<RequirementInput> = {}): RequirementInput => ({
  projectId: 'proj-1',
  code: 'REQ-PAY-90',
  title: 'คืนเงินบางส่วน',
  description: '',
  type: 'functional',
  priority: 'medium',
  status: 'draft',
  origin: 'tor',
  torClause: ' 4.5.2 ',
  acceptanceCriteria: [],
  ...over,
})

describe('saveRequirement', () => {
  it('a TOR requirement names its clause; an additional one has none', async () => {
    await signIn(USERS.admin)
    expect((await saveRequirement(input())).requirement).toMatchObject({ origin: 'tor', torClause: '4.5.2' })
    expect(await refusal(saveRequirement(input({ code: 'REQ-PAY-91', torClause: ' ' })))).toMatchObject({ status: 400 })
    const extra = (await saveRequirement(input({ code: 'REQ-PAY-92', origin: 'additional' }))).requirement!
    expect(extra.torClause).toBeUndefined()
  })
})

describe('searchRequirements', () => {
  it('finds a requirement by its TOR clause', async () => {
    await signIn(USERS.admin)
    expect((await searchRequirements('4.2.1')).requirements.map((r) => r.code)).toEqual(['REQ-PAY-04'])
  })
})
