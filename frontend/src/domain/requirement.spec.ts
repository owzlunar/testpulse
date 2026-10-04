import { describe, expect, it } from 'vitest'
import { nextRequirementCode, requirementFromCells, type RequirementCells } from './requirement'

const cells = (over: Partial<RequirementCells> = {}): RequirementCells => ({
  code: '',
  origin: '',
  torClause: '',
  title: 'ส่งออกรายงานภาษี',
  description: '',
  acceptanceCriteria: '',
  type: '',
  priority: '',
  status: '',
  source: '',
  ...over,
})

describe('requirementFromCells', () => {
  it('a TOR clause makes it a TOR requirement unless the origin column says otherwise', () => {
    expect(requirementFromCells(cells({ torClause: ' 4.2.1 ' }))).toMatchObject({ origin: 'tor', torClause: '4.2.1' })
    expect(requirementFromCells(cells())).toMatchObject({ origin: 'additional' })
    const extra = requirementFromCells(cells({ origin: 'เพิ่มเติม', torClause: '4.2.1' }))
    expect(extra.origin).toBe('additional')
    expect(extra.torClause).toBeUndefined()
    expect(requirementFromCells(cells({ origin: 'TOR' })).origin).toBe('tor')
  })

  it('reads the words people use for type, priority and status; criteria one per line or ";"', () => {
    const r = requirementFromCells(
      cells({ type: 'Non-functional', priority: 'สูง', status: 'Approved', acceptanceCriteria: '1. ส่งภายใน 1 นาที\n- แนบ PDF; มีเลขที่' }),
    )
    expect(r).toMatchObject({ type: 'non_functional', priority: 'high', status: 'approved' })
    expect(r.acceptanceCriteria).toEqual(['ส่งภายใน 1 นาที', 'แนบ PDF', 'มีเลขที่'])
    expect(requirementFromCells(cells({ type: 'Business rule' }))).toMatchObject({ type: 'business_rule', priority: 'medium', status: 'draft' })
    expect(requirementFromCells(cells({ code: '' })).code).toBeUndefined()
  })
})

describe('nextRequirementCode', () => {
  it('follows the highest number', () => {
    expect(nextRequirementCode('PAY', ['REQ-PAY-01', 'REQ-PAY-09', 'X'])).toBe('REQ-PAY-10')
    expect(nextRequirementCode('PAY', [])).toBe('REQ-PAY-01')
  })
})
