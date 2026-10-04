import { describe, expect, it } from 'vitest'
import { caseSyncBlock, latestEnvironmentResults } from '@/domain/run'
import { createRun, fetchRuns, saveResult, updateRun } from './run'
import { storedProjects } from './project'
import { storedCase, storedCases, updateTestCase } from './test-case'
import type { TestRun } from '@/types'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// A verdict becomes the case status only when it is the latest result for the current spec

const PAY = 'proj-1'
const pay = () => storedProjects().find((p) => p.id === PAY)!
const runsOfPay = async () => (await fetchRuns()).filter((r) => r.projectId === PAY).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

async function openRuns(): Promise<[TestRun, TestRun]> {
  await signIn(USERS.admin)
  const [older] = await runsOfPay()
  if (older.status === 'completed') await updateRun(older.id, { status: 'in_progress' })
  const [o, n] = await runsOfPay()
  return [o, n]
}

describe('caseSyncBlock', () => {
  it('blocks a closed run, a deleted case, an older version and a superseded run', async () => {
    const [older, newer] = await openRuns()
    const result = older.results.find((r) => r.caseId === 'TC-101')!
    const tc = storedCase(PAY, 'TC-101')!
    expect(caseSyncBlock({ ...older, status: 'completed' }, result, tc, [older, newer], pay())).toContain('ปิดแล้ว')
    expect(caseSyncBlock(older, { ...result, caseDeleted: true }, tc, [older, newer], pay())).toContain('ถูกลบ')
    expect(caseSyncBlock(older, { ...result, caseVersion: 'v0.9' }, tc, [older, newer], pay())).toContain('v0.9')
    // the newer run already has a result for TC-101
    expect(caseSyncBlock(older, { ...result, caseVersion: tc.version }, tc, [older, newer], pay())).toContain(newer.name)
  })
})

describe('saveResult', () => {
  it('a verdict in the latest run for the current version updates the case', async () => {
    const [, newer] = await openRuns()
    const actor = await signIn(USERS.admin)
    const result = newer.results.find((r) => r.caseId === 'TC-103')!
    const { caseUpdate } = await saveResult(newer.id, { ...result, status: 'passed' }, actor)
    expect(caseUpdate?.testCase.status).toBe('passed')
    expect(caseUpdate?.newVersion).toBe(false)
  })

  it('a verdict in an older run is saved but does not touch the case', async () => {
    const [older] = await openRuns()
    const actor = await signIn(USERS.admin)
    const before = storedCase(PAY, 'TC-101')!.status
    const result = older.results.find((r) => r.caseId === 'TC-101')!
    const { run, caseUpdate } = await saveResult(older.id, { ...result, status: 'failed' }, actor)
    expect(caseUpdate).toBeNull()
    expect(run.results.find((r) => r.caseId === 'TC-101')!.status).toBe('failed')
    expect(storedCase(PAY, 'TC-101')!.status).toBe(before)
  })

  it('a result for a version the case no longer has does not touch the case', async () => {
    const [, newer] = await openRuns()
    const actor = await signIn(USERS.admin)
    await updateTestCase(PAY, 'TC-103', { name: 'สเปกใหม่' }, actor)
    const result = newer.results.find((r) => r.caseId === 'TC-103')!
    expect((await saveResult(newer.id, { ...result, status: 'passed' }, actor)).caseUpdate).toBeNull()
  })

  it('a closed run refuses results', async () => {
    const [, newer] = await openRuns()
    const actor = await signIn(USERS.admin)
    await updateRun(newer.id, { status: 'completed' })
    expect((await refusal(saveResult(newer.id, newer.results[0], actor))).status).toBe(409)
  })
})

describe('environments', () => {
  /** a run of the given cases on STAGING (the demo project's other environment) */
  async function stagingRun(caseIds: string[]) {
    const actor = await signIn(USERS.admin)
    const input = {
      projectId: PAY,
      name: 'UAT ลูกค้า',
      type: 'uat' as const,
      round: 1,
      environmentId: 'env-staging',
      build: '',
      plannedStart: '',
      plannedEnd: '',
      caseIds,
    }
    return {
      actor,
      run: await createRun(
        input,
        storedCases().filter((c) => c.projectId === PAY),
        actor.name,
      ),
    }
  }

  it('a run picks one of the project environments; the server names it', async () => {
    const { run, actor } = await stagingRun(['TC-101'])
    expect(run).toMatchObject({ environmentId: 'env-staging', environment: 'STAGING' })
    const bad = {
      projectId: PAY,
      name: 'x',
      type: 'uat' as const,
      round: 1,
      environmentId: 'env-nope',
      build: '',
      plannedStart: '',
      plannedEnd: '',
      caseIds: ['TC-101'],
    }
    expect((await refusal(createRun(bad, [storedCase(PAY, 'TC-101')!], actor.name))).status).toBe(422)
  })

  it('a result on another environment is kept there and never changes the case status', async () => {
    const { run, actor } = await stagingRun(['TC-101', 'TC-104'])
    const before = storedCase(PAY, 'TC-104')!
    const result = run.results.find((r) => r.caseId === 'TC-104')!
    const saved = await saveResult(run.id, { ...result, status: before.status === 'failed' ? 'passed' : 'failed' }, actor)
    expect(saved.caseUpdate).toBeNull()
    expect(storedCase(PAY, 'TC-104')!.status).toBe(before.status)
    expect(caseSyncBlock(saved.run, result, before, await fetchRuns(), pay())).toContain('STAGING')

    const latest = latestEnvironmentResults(await fetchRuns(), 'env-staging', pay())
    expect(latest.get('TC-104')).toMatchObject({ runId: run.id, environmentId: 'env-staging' })
    expect(latest.has('TC-101')).toBe(false)
  })

  it('a newer run on another environment does not supersede the primary one', async () => {
    const [, newer] = await openRuns()
    const { run, actor } = await stagingRun(['TC-103'])
    const staging = run.results.find((r) => r.caseId === 'TC-103')!
    await saveResult(run.id, { ...staging, status: 'failed' }, actor)
    const result = newer.results.find((r) => r.caseId === 'TC-103')!
    const { caseUpdate } = await saveResult(newer.id, { ...result, status: 'passed' }, actor)
    expect(caseUpdate?.testCase.status).toBe('passed')
  })
})
