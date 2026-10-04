import { describe, expect, it } from 'vitest'
import type { RequirementInput } from '@/types'
import { importRequirements, saveRequirement, searchRequirements } from './requirement'
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

describe('importRequirements', () => {
  const row = (over: Partial<RequirementInput> = {}) => {
    const { projectId: _p, code: _c, ...fields } = input({ origin: 'additional', torClause: undefined, ...over })
    return { ...fields, ...(over.code && { code: over.code }) }
  }

  it('numbers rows without a code; existing codes are skipped, or updated when asked', async () => {
    await signIn(USERS.admin)
    const res = await importRequirements('proj-1', [row({ title: 'ใหม่' }), row({ code: 'REQ-PAY-01', title: 'สร้าง QR แบบใหม่' })], false)
    expect(res.created.map((r) => r.code)).toEqual(['REQ-PAY-07'])
    expect(res.skipped).toEqual(['REQ-PAY-01'])
    const updated = await importRequirements('proj-1', [row({ code: 'REQ-PAY-01', title: 'สร้าง QR แบบใหม่' })], true)
    expect(updated.updated[0]?.title).toBe('สร้าง QR แบบใหม่')
    expect(updated.flaggedCases.map((c) => c.id)).toContain('TC-101')
  })

  it('refuses the same code twice', async () => {
    await signIn(USERS.admin)
    expect(await refusal(importRequirements('proj-1', [row({ code: 'X-1' }), row({ code: 'X-1' })], false))).toMatchObject({ status: 422 })
  })
})
