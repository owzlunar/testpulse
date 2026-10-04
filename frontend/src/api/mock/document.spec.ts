import { describe, expect, it } from 'vitest'
import { uatBlock } from '@/domain/document'
import type { DocumentRequest, UatDetails } from '@/types'
import { generateDocument } from './document'
import { createRun, fetchRuns, saveResult } from './run'
import { storedCases } from './test-case'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// A document freezes the project's data; the Release gatekeeper guards UAT sign-offs

const PAY = 'proj-1'
const uat = (over: Partial<UatDetails> = {}): UatDetails => ({
  testPeriod: '',
  environment: 'UAT',
  decision: 'conditional',
  remarks: '',
  riskAcknowledged: true,
  ...over,
})
const request = (over: Partial<DocumentRequest> = {}): DocumentRequest => ({
  projectId: PAY,
  type: 'test_summary',
  title: 'สรุปผล',
  docNumber: 'TSR-PAY-01',
  options: { includeSubCases: true, includeSteps: true, includeEvidence: false, includeDefects: true, includeTraceability: false },
  signatories: [],
  ...over,
})

describe('uatBlock', () => {
  it('lets anything through without risks; with risks, refuses full acceptance and wants them acknowledged', () => {
    expect(uatBlock(uat({ decision: 'accepted' }), [])).toBeNull()
    expect(uatBlock(undefined, ['x'])).toBeNull()
    expect(uatBlock(uat({ decision: 'accepted' }), ['มีเคสไม่ผ่าน 1 เคส'])).toBe('ไม่สามารถตรวจรับแบบสมบูรณ์ได้: มีเคสไม่ผ่าน 1 เคส')
    expect(uatBlock(uat({ riskAcknowledged: false }), ['x'])).toContain('ยืนยันรับทราบความเสี่ยง')
    expect(uatBlock(uat(), ['x'])).toBeNull()
  })
})

describe('generateDocument', () => {
  it('prints a run as it was executed, and counts what is at risk', async () => {
    const actor = await signIn(USERS.admin)
    const run = (await fetchRuns()).find((r) => r.projectId === PAY)!
    const doc = await generateDocument(request({ options: { ...request().options, runId: run.id } }), actor.name)
    expect(doc.snapshot.run?.name).toBe(run.name)
    expect(doc.snapshot.cases.map((c) => c.id).sort()).toEqual(run.results.map((r) => r.caseId).sort())
    const { failed, blocked } = doc.snapshot.summary
    if (failed) expect(doc.snapshot.risks).toContain(`มีเคสไม่ผ่าน ${failed} เคส`)
    if (blocked) expect(doc.snapshot.risks).toContain(`มีเคสที่ทดสอบไม่ได้ (Blocked) ${blocked} เคส`)
  })

  it('refuses a full UAT acceptance while there are risks', async () => {
    const actor = await signIn(USERS.admin)
    const refused = await refusal(generateDocument(request({ type: 'uat', uat: uat({ decision: 'accepted' }) }), actor.name))
    expect(refused).toMatchObject({ status: 422, message: expect.stringContaining('ไม่สามารถตรวจรับแบบสมบูรณ์ได้') })
  })

  it('TOR only: the TOR requirements by clause, and only the cases that test them', async () => {
    const actor = await signIn(USERS.admin)
    const doc = await generateDocument(
      request({ type: 'rtm', options: { ...request().options, includeTraceability: true, torOnly: true } }),
      actor.name,
    )
    expect(doc.snapshot.requirements.map((r) => `${r.torClause} ${r.code}`)).toEqual([
      '4.1.1 REQ-PAY-01',
      '4.1.2 REQ-PAY-02',
      '4.2.1 REQ-PAY-04',
      '4.3 REQ-PAY-05',
    ])
    expect(doc.snapshot.cases.map((c) => c.id)).toEqual(['TC-101', 'TC-101-1', 'TC-104'])
  })

  it('UAT on STAGING prints each case’s latest result there; a run of another environment is refused', async () => {
    const actor = await signIn(USERS.admin)
    const input = {
      projectId: PAY,
      name: 'UAT',
      type: 'uat' as const,
      round: 1,
      environmentId: 'env-staging',
      build: '',
      plannedStart: '',
      plannedEnd: '',
      caseIds: ['TC-104'],
    }
    const run = await createRun(
      input,
      storedCases().filter((c) => c.projectId === PAY),
      actor.name,
    )
    await saveResult(run.id, { ...run.results[0]!, status: 'passed', actualResults: 'บน STAGING' }, actor)

    const staging = uat({ environmentId: 'env-staging' })
    const doc = await generateDocument(request({ type: 'uat', uat: staging }), actor.name)
    expect(doc.uat?.environment).toBe('STAGING')
    expect(doc.snapshot.cases.find((c) => c.id === 'TC-104')).toMatchObject({ outcome: 'passed', actualResults: 'บน STAGING' })
    expect(doc.snapshot.cases.find((c) => c.id === 'TC-103')?.outcome).toBe('not_run')

    const testRun = (await fetchRuns()).find((r) => r.projectId === PAY && r.environmentId === 'env-test')!
    const refused = await refusal(
      generateDocument(request({ type: 'uat', uat: staging, options: { ...request().options, runId: testRun.id } }), actor.name),
    )
    expect(refused.status).toBe(422)
  })
})
