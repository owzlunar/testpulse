import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AuditTrailEntry, RunResult, TestCase, TestRun } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

// Demo runs of proj-1: run-1 "Sprint 42 · Functional" (completed: TC-103 failed, TC-104 blocked, the
// rest passed) and run-2 "Sprint 42 · Regression" (in progress, newer: TC-101 / TC-101-1 passed).
// Cases: TC-101 passed · TC-103 failed · TC-104 blocked. user-qa-1 QA Lead · user-qa-2 QA Tester
// (e-commerce only) · user-dev-1 Developer.

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const runsOf = async (userId: string): Promise<TestRun[]> => (await as(userId).get('/test-runs')).body.data
const runOf = async (id: string) => (await runsOf('user-qa-1')).find((r) => r.id === id)!
const caseOf = async (id: string): Promise<TestCase> =>
  ((await as('user-qa-1').get('/projects/proj-1/test-cases')).body.data as TestCase[]).find((c) => c.id === id)!
const verdict = (status: RunResult['status'], over: Record<string, unknown> = {}) => ({
  status,
  stepResults: [],
  actualResults: '',
  evidence: [],
  defectIds: [],
  notes: '',
  ...over,
})

describe('runs', () => {
  it('are listed for the projects one may open, newest first', async () => {
    expect((await runsOf('user-qa-1')).map((r) => r.id)).toEqual(['run-2', 'run-1'])
    expect(await runsOf('user-qa-2')).toEqual([])
  })

  it('snapshot the chosen active cases on the server; planning needs run.create', async () => {
    const input = {
      name: 'Smoke',
      type: 'smoke',
      round: 1,
      environment: 'UAT',
      build: 'b1',
      plannedStart: '2026-10-05',
      plannedEnd: '2026-10-06',
      caseIds: ['TC-101', 'TC-103', 'TC-999'],
    }
    expect((await as('user-dev-1').post('/projects/proj-1/test-runs').send(input)).status).toBe(403)
    const res = await as('user-qa-1').post('/projects/proj-1/test-runs').send(input)
    expect(res.status).toBe(201)
    const tc = await caseOf('TC-101')
    expect(res.body.data).toMatchObject({ status: 'planned', createdBy: 'สมชาย ประเสริฐ (QA Lead)' })
    expect(res.body.data.results.map((r: RunResult) => [r.caseId, r.caseVersion, r.status])).toEqual([
      ['TC-101', tc.version, 'untested'],
      ['TC-103', expect.any(String), 'untested'],
    ])
    expect(
      (
        await as('user-qa-1')
          .post('/projects/proj-1/test-runs')
          .send({ ...input, caseIds: ['TC-999'] })
      ).status,
    ).toBe(422)
  })

  it('close with run.close, stamped and recorded', async () => {
    expect((await as('user-qa-2').patch('/test-runs/run-2').send({ status: 'completed' })).status).toBe(403)
    const res = await as('user-qa-1').patch('/test-runs/run-2').send({ status: 'completed' })
    expect(res.body.data).toMatchObject({ status: 'completed', completedAt: expect.any(String) })
    const audit = (await as('user-admin').get('/audit-logs')).body.data as AuditTrailEntry[]
    expect(audit.find((e) => e.targetId === 'run-2')).toMatchObject({
      action: 'STATUS_CHANGE',
      details: 'ปิดรอบทดสอบ Sprint 42 · Regression รอบที่ 2',
    })
  })
})

describe('results', () => {
  it('stamp the tester and keep the snapshot; a verdict in the latest run becomes the case status', async () => {
    const res = await as('user-qa-1')
      .put('/test-runs/run-2/results/TC-104')
      .send(verdict('passed', { caseName: 'แก้ชื่อจากเครื่องลูกข่าย', actualResults: 'ผ่านแล้ว' }))
    expect(res.status).toBe(200)
    const result = res.body.data.run.results.find((r: RunResult) => r.caseId === 'TC-104')
    expect(result).toMatchObject({
      status: 'passed',
      executedBy: 'สมชาย ประเสริฐ (QA Lead)',
      caseName: (await runOf('run-1')).results.find((r) => r.caseId === 'TC-104')!.caseName,
    })
    expect(res.body.data.caseUpdate).toMatchObject({ statusChanged: true, testCase: { id: 'TC-104', status: 'passed', actualResults: 'ผ่านแล้ว' } })
    expect((await caseOf('TC-104')).status).toBe('passed')
  })

  it('in an older run are kept but do not change the case; a closed run takes none', async () => {
    expect((await as('user-qa-1').put('/test-runs/run-1/results/TC-101').send(verdict('failed'))).status).toBe(409)
    await as('user-qa-1').patch('/test-runs/run-1').send({ status: 'in_progress' })
    const res = await as('user-qa-1').put('/test-runs/run-1/results/TC-101').send(verdict('failed'))
    expect(res.body.data.caseUpdate).toBeNull()
    expect((await caseOf('TC-101')).status).toBe('passed')
  })

  it('need run.execute and the project', async () => {
    expect((await as('user-dev-1').put('/test-runs/run-2/results/TC-104').send(verdict('passed'))).status).toBe(403)
    expect((await as('user-qa-2').put('/test-runs/run-2/results/TC-104').send(verdict('passed'))).status).toBe(403)
    expect((await as('user-qa-1').put('/test-runs/run-2/results/TC-777').send(verdict('passed'))).status).toBe(404)
  })

  it('start a planned run', async () => {
    const created = (
      await as('user-qa-1')
        .post('/projects/proj-1/test-runs')
        .send({ name: 'R', type: 'smoke', round: 1, caseIds: ['TC-103'] })
    ).body.data as TestRun
    const res = await as('user-qa-1').put(`/test-runs/${created.id}/results/TC-103`).send(verdict('blocked'))
    expect(res.body.data.run).toMatchObject({ status: 'in_progress', startedAt: expect.any(String) })
  })
})

describe('following the cases', () => {
  it('results follow renumbered ids, and archiving a case shows the runs it is in', async () => {
    const cases = ((await as('user-qa-1').get('/projects/proj-1/test-cases')).body.data as TestCase[]).filter((c) => !c.parentId)
    await as('user-qa-1')
      .put('/projects/proj-1/test-cases/order')
      .send({ order: [...cases].reverse().map((c) => ({ id: c.id, subIds: c.id === 'TC-101' ? ['TC-101-1'] : [] })) })
    // TC-104 -> TC-101, TC-103 -> TC-102, TC-101 -> TC-103 (with its sub-case)
    const run1 = await runOf('run-1')
    expect(run1.results.find((r) => r.caseId === 'TC-101')).toMatchObject({ status: 'blocked' })
    expect(run1.results.find((r) => r.caseId === 'TC-103-1')).toMatchObject({ status: 'passed' })

    const impact = (await as('user-qa-1').get('/projects/proj-1/test-cases/TC-103/impact')).body.data
    expect(impact.runs).toEqual(
      expect.arrayContaining([
        { name: 'Sprint 42 · Functional', round: 1, open: false },
        { name: 'Sprint 42 · Regression', round: 2, open: true },
      ]),
    )
  })

  it('results of a deleted case stay as history, detached from its id', async () => {
    await as('user-qa-1').post('/projects/proj-1/test-cases/TC-104/archive').send({})
    await as('user-qa-1').delete('/projects/proj-1/test-cases/TC-104').send({})
    expect((await runOf('run-1')).results.find((r) => r.caseId === 'TC-104')).toMatchObject({ caseDeleted: true, status: 'blocked' })
  })
})
