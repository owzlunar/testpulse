import { describe, expect, it } from 'vitest'
import { fetchDefects } from './defect.service'
import { fetchRuns } from './run.service'
import {
  archiveTestCase,
  createTestCases,
  deleteTestCase,
  fetchTestCases,
  hasSpecChanges,
  reorderTestCases,
  restoreTestCase,
  restoreVersion,
  storedCase,
  updateTestCase,
} from './test-case.service'
import type { TestCase, TestCaseInput } from '@/types'
import { USERS, refusal, signIn } from '../../tests/helpers'

// Server-side rules of the test case API (the backend must behave the same)

const PAY = 'proj-1'
const ids = (cases: TestCase[], projectId = PAY) => cases.filter((c) => c.projectId === projectId).map((c) => c.id)

describe('versioning (applyCasePatch)', () => {
  it('a status change alone keeps the version', async () => {
    const actor = await signIn(USERS.admin)
    const before = storedCase(PAY, 'TC-104')!
    const { testCase, newVersion } = await updateTestCase(PAY, 'TC-104', { status: 'ready_for_test' }, actor)
    expect(newVersion).toBe(false)
    expect(testCase.version).toBe(before.version)
    expect(testCase.versionHistory).toHaveLength(before.versionHistory!.length)
  })

  it('a spec change makes a new minor version with a snapshot', async () => {
    const actor = await signIn(USERS.admin)
    const before = storedCase(PAY, 'TC-104')!
    const { testCase, newVersion } = await updateTestCase(PAY, 'TC-104', { name: 'ชื่อใหม่' }, actor)
    expect(newVersion).toBe(true)
    expect(testCase.version).not.toBe(before.version)
    expect(testCase.versionHistory!.at(-1)!.snapshot!.name).toBe('ชื่อใหม่')
  })

  it('changing the spec of a passed case cancels the pass', async () => {
    const actor = await signIn(USERS.admin)
    expect(storedCase(PAY, 'TC-101')!.status).toBe('passed')
    const result = await updateTestCase(PAY, 'TC-101', { testScenario: 'ขั้นตอนใหม่' }, actor)
    expect(result.passInvalidated).toBe(true)
    expect(result.testCase.status).toBe('ready_for_test')
  })

  it('id, project and parent cannot be changed by a patch', async () => {
    const actor = await signIn(USERS.admin)
    const { testCase } = await updateTestCase(PAY, 'TC-104', { id: 'TC-999', projectId: 'proj-2', parentId: 'TC-101' }, actor)
    expect([testCase.id, testCase.projectId, testCase.parentId ?? null]).toEqual(['TC-104', PAY, null])
  })

  it('saving the requirement links a legacy case already had (by its text) is not a change', async () => {
    await signIn(USERS.admin)
    const tc = storedCase(PAY, 'TC-101')!
    expect(tc.requirementIds?.length ?? 0).toBe(0)
    const { requirementsOf } = await import('./requirement.service')
    expect(hasSpecChanges(tc, { requirementIds: ['req-req-pay-01'] }, requirementsOf(PAY))).toBe(false)
  })
})

describe('ids', () => {
  it('a new case without an id gets the next number, counting archived cases', async () => {
    const actor = await signIn(USERS.admin)
    await archiveTestCase(PAY, 'TC-104', actor)
    const base = storedCase(PAY, 'TC-103')!
    const [created] = await createTestCases(PAY, [{ ...(base as TestCaseInput), id: '', parentId: null }], actor)
    expect(created.id).toBe('TC-105')
    expect(created.version).toBe('v1.0')
  })

  it('a taken id is refused', async () => {
    const actor = await signIn(USERS.admin)
    const base = storedCase(PAY, 'TC-103')!
    expect((await refusal(createTestCases(PAY, [{ ...(base as TestCaseInput) }], actor))).status).toBe(409)
  })
})

describe('reorder renumbers and re-keys what points at a case', () => {
  it('moving TC-104 first renames every case and their runs / defects follow', async () => {
    await signIn(USERS.admin)
    await fetchRuns() // seeds the runs from the current cases
    await reorderTestCases(PAY, [
      { id: 'TC-104', subIds: [] },
      { id: 'TC-101', subIds: ['TC-101-1'] },
      { id: 'TC-103', subIds: [] },
    ])
    const cases = await fetchTestCases(PAY)
    expect(ids(cases)).toEqual(['TC-101', 'TC-102', 'TC-102-1', 'TC-103'])
    expect(cases.find((c) => c.id === 'TC-101')!.name).toContain('Webhook')
    const bug3 = (await fetchDefects()).find((d) => d.id === 'BUG-003')!
    expect(bug3.caseId).toBe('TC-101')
    const run = (await fetchRuns()).find((r) => r.projectId === PAY)!
    expect(run.results.find((r) => r.caseName.includes('Webhook'))!.caseId).toBe('TC-101')
  })

  it('an order that misses a case is refused', async () => {
    await signIn(USERS.admin)
    expect((await refusal(reorderTestCases(PAY, [{ id: 'TC-101', subIds: ['TC-101-1'] }]))).status).toBe(409)
  })
})

describe('archive and permanent delete', () => {
  it('archiving keeps references; restoring brings the sub-cases back', async () => {
    const actor = await signIn(USERS.admin)
    const archived = await archiveTestCase(PAY, 'TC-101', actor)
    expect(archived.map((c) => c.id)).toEqual(['TC-101', 'TC-101-1'])
    expect((await fetchDefects()).find((d) => d.id === 'BUG-002')!.caseDeleted).toBeFalsy()
    await restoreTestCase(PAY, 'TC-101')
    expect(storedCase(PAY, 'TC-101-1')!.archivedAt).toBeUndefined()
  })

  it('only archived cases can be deleted, and their references are detached', async () => {
    const actor = await signIn(USERS.admin)
    expect((await refusal(deleteTestCase(PAY, 'TC-104'))).status).toBe(409)
    await archiveTestCase(PAY, 'TC-104', actor)
    await deleteTestCase(PAY, 'TC-104')
    expect(storedCase(PAY, 'TC-104')).toBeUndefined()
    expect((await fetchDefects()).find((d) => d.id === 'BUG-003')!.caseDeleted).toBe(true)
  })

  it('an archived case cannot be edited', async () => {
    const actor = await signIn(USERS.admin)
    await archiveTestCase(PAY, 'TC-104', actor)
    expect((await refusal(updateTestCase(PAY, 'TC-104', { name: 'x' }, actor))).status).toBe(409)
  })
})

describe('restore a version', () => {
  it('brings an old spec back as a new version', async () => {
    const actor = await signIn(USERS.admin)
    const v = storedCase(PAY, 'TC-104')!.version
    await updateTestCase(PAY, 'TC-104', { name: 'ชื่อชั่วคราว' }, actor)
    const { testCase } = await restoreVersion(PAY, 'TC-104', v, actor)
    expect(testCase.name).not.toBe('ชื่อชั่วคราว')
    expect(testCase.versionHistory!.at(-1)!.changeSummary).toContain(v)
  })
})

describe('stale changes (assertFresh)', () => {
  const seen = (id: string) => {
    const tc = storedCase(PAY, id)!
    return { uid: tc.uid!, rev: tc.rev! }
  }

  it('a change based on the current copy is accepted and bumps the revision', async () => {
    const actor = await signIn(USERS.admin)
    const before = seen('TC-104')
    const { testCase } = await updateTestCase(PAY, 'TC-104', { status: 'ready_for_test' }, actor, before)
    expect(testCase.rev).toBe(before.rev + 1)
    expect(testCase.uid).toBe(before.uid)
  })

  it('a change based on an older copy is refused (someone else saved first)', async () => {
    const actor = await signIn(USERS.admin)
    const mine = seen('TC-104')
    await updateTestCase(PAY, 'TC-104', { name: 'บันทึกโดยอีกคน' }, actor, mine)
    const err = await refusal(updateTestCase(PAY, 'TC-104', { name: 'ของฉัน' }, actor, mine))
    expect(err.status).toBe(409)
    expect(err.message).toContain('ถูกแก้ไขโดย')
    expect(storedCase(PAY, 'TC-104')!.name).toBe('บันทึกโดยอีกคน')
  })

  it('after a reorder, an old copy cannot write to the case that now has its id', async () => {
    const actor = await signIn(USERS.admin)
    const tc103 = seen('TC-103') // Concurrency test
    await reorderTestCases(PAY, [
      { id: 'TC-103', subIds: [] },
      { id: 'TC-101', subIds: ['TC-101-1'] },
      { id: 'TC-104', subIds: [] },
    ])
    // TC-103 is now the Webhook case; the form opened before still says TC-103
    const err = await refusal(updateTestCase(PAY, 'TC-103', { name: 'x' }, actor, tc103))
    expect(err.status).toBe(409)
    expect(err.message).toContain('จัดลำดับ')
  })

  it('a reorder made from a list someone renumbered since is refused', async () => {
    await signIn(USERS.admin)
    const uids = Object.fromEntries((await fetchTestCases(PAY)).map((c) => [c.id, c.uid!]))
    const order = [
      { id: 'TC-104', subIds: [] },
      { id: 'TC-101', subIds: ['TC-101-1'] },
      { id: 'TC-103', subIds: [] },
    ]
    await reorderTestCases(PAY, order, uids) // someone else moves TC-104 first
    expect((await refusal(reorderTestCases(PAY, order, uids))).status).toBe(409)
  })
})
