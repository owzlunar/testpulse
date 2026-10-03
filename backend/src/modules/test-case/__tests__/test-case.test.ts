import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AuditTrailEntry, NotificationItem, TestCase } from '#contract/types.js'
import { addDays } from '#contract/rules/date.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'
import { announceDueDates } from '../test-case.jobs.js'

// Demo cases of proj-1 (team-payment): TC-101 passed (REQ-PAY-01) · TC-101-1 passed (sub-case) ·
// TC-103 failed (assigned to user-qa-1 / user-dev-1 by name) · TC-104. proj-2: TC-201, TC-202.
// user-qa-1 QA Lead (payment) · user-qa-2 QA Tester (e-commerce) · user-dev-1 Developer (payment)

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const casesOf = async (projectId = 'proj-1', userId = 'user-qa-1'): Promise<TestCase[]> =>
  (await as(userId).get(`/projects/${projectId}/test-cases`)).body.data
const caseOf = async (id: string, projectId = 'proj-1') => (await casesOf(projectId)).find((c) => c.id === id)!
const expectOf = (tc: TestCase) => ({ uid: tc.uid, rev: tc.rev })
const notificationsOf = async (userId: string): Promise<NotificationItem[]> => (await as(userId).get('/notifications')).body.data
const auditOf = async (id: string): Promise<AuditTrailEntry[]> =>
  ((await as('user-admin').get('/audit-logs')).body.data as AuditTrailEntry[]).filter((e) => e.targetType === 'TEST_CASE' && e.targetId === id)

const newCase = (over: Record<string, unknown> = {}) => ({
  name: 'ตรวจสอบยอดเงินติดลบ',
  testScenario: 'กรอกยอดเงินติดลบ',
  prerequisite: '',
  priority: 'high',
  status: 'pending',
  steps: [{ id: 's-1', stepNumber: 1, action: 'กรอก -1', testData: '-1', expectedResult: 'ระบบปฏิเสธ' }],
  expectedResults: 'ปฏิเสธ',
  expiryDate: '2026-12-01',
  ...over,
})

describe('reading', () => {
  it('lists a project in list order to those who may open it, with uid and rev but no position', async () => {
    const cases = await casesOf()
    expect(cases.map((c) => c.id)).toEqual(['TC-101', 'TC-101-1', 'TC-103', 'TC-104'])
    expect(cases[0]).toMatchObject({ uid: expect.any(String), rev: 1 })
    expect(cases[0]).not.toHaveProperty('position')
    expect((await as('user-qa-2').get('/projects/proj-1/test-cases')).status).toBe(403)
  })

  it('searches active cases of the projects one may open, also by their linked requirement', async () => {
    const search = async (userId: string, q: string) =>
      ((await as(userId).get(`/test-cases?search=${encodeURIComponent(q)}`)).body.data as { cases: TestCase[] }).cases.map((c) => c.id)
    expect(await search('user-qa-1', 'PromptPay')).toContain('TC-101')
    expect(await search('user-qa-2', 'PromptPay')).not.toContain('TC-101')
    expect(await search('user-qa-1', '')).toEqual([])
  })
})

describe('creating', () => {
  it('numbers new cases after the last one, starts them at v1.0 and records it', async () => {
    const res = await as('user-qa-1')
      .post('/projects/proj-1/test-cases')
      .send({ cases: [newCase(), newCase({ name: 'อีกเคส' })] })
    expect(res.status).toBe(201)
    expect(res.body.data.map((c: TestCase) => [c.id, c.version, c.versionHistory?.length])).toEqual([
      ['TC-105', 'v1.0', 1],
      ['TC-106', 'v1.0', 1],
    ])
    expect((await casesOf()).map((c) => c.id).slice(-2)).toEqual(['TC-105', 'TC-106'])
  })

  it('takes a free sub-case id, refuses one in use, and tells the developers about a pending case', async () => {
    const sub = await as('user-qa-1')
      .post('/projects/proj-1/test-cases')
      .send({ cases: [newCase({ id: 'TC-103-1', numericId: 103, parentId: 'TC-103' })] })
    expect(sub.status).toBe(201)
    expect(await auditOf('TC-103-1')).toEqual([expect.objectContaining({ action: 'ADD_SUBCASE', userId: 'user-qa-1' })])
    expect((await notificationsOf('user-dev-1')).map((n) => n.title)).toContain('มี Test Case ใหม่รอ Dev พัฒนา')
    const again = await as('user-qa-1')
      .post('/projects/proj-1/test-cases')
      .send({ cases: [newCase({ id: 'TC-103-1', numericId: 103, parentId: 'TC-103' })] })
    expect(again.status).toBe(409)
  })

  it('needs case.edit and the project', async () => {
    expect(
      (
        await as('user-dev-1')
          .post('/projects/proj-1/test-cases')
          .send({ cases: [newCase()] })
      ).status,
    ).toBe(403)
    expect(
      (
        await as('user-qa-2')
          .post('/projects/proj-1/test-cases')
          .send({ cases: [newCase()] })
      ).status,
    ).toBe(403)
  })

  it('takes images as file links only', async () => {
    const dataUrl = `data:image/png;base64,${'A'.repeat(5000)}`
    expect(
      (
        await as('user-qa-1')
          .post('/projects/proj-1/test-cases')
          .send({ cases: [newCase({ expectedImages: [dataUrl] })] })
      ).status,
    ).toBe(400)
  })
})

describe('changing', () => {
  it('versions a spec change; on a passed case the pass is cancelled and QA told to test again', async () => {
    const tc = await caseOf('TC-101')
    const res = await as('user-qa-1')
      .patch('/projects/proj-1/test-cases/TC-101')
      .send({ patch: { name: 'ชื่อใหม่', changeSummary: 'ปรับชื่อ' }, expected: expectOf(tc) })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      statusChanged: true,
      newVersion: true,
      passInvalidated: true,
      testCase: { status: 'ready_for_test', version: 'v1.3', rev: 2 },
    })
    const [entry] = await auditOf('TC-101')
    expect(entry).toMatchObject({ action: 'STATUS_CHANGE', details: 'v1.2 → v1.3 · แก้ไขข้อกำหนดหลังผ่านการทดสอบ สถานะกลับเป็นพร้อมให้ทดสอบ' })
  })

  it('refuses a change based on an outdated copy (409 stale)', async () => {
    const tc = await caseOf('TC-103')
    await as('user-qa-1')
      .patch('/projects/proj-1/test-cases/TC-103')
      .send({ patch: { priority: 'low' }, expected: expectOf(tc) })
    const res = await as('user-qa-1')
      .patch('/projects/proj-1/test-cases/TC-103')
      .send({ patch: { priority: 'high' }, expected: expectOf(tc) })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('stale')
  })

  it('lets a developer hand a case off but not edit it, and counts the bounce', async () => {
    const tc = await caseOf('TC-103')
    expect(
      (
        await as('user-dev-1')
          .patch('/projects/proj-1/test-cases/TC-103')
          .send({ patch: { name: 'x' } })
      ).status,
    ).toBe(403)
    const res = await as('user-dev-1')
      .patch('/projects/proj-1/test-cases/TC-103')
      .send({ patch: { status: 'ready_for_test' }, expected: expectOf(tc) })
    expect(res.status).toBe(200)
    expect(res.body.data.testCase.churnCount).toBe((tc.churnCount ?? 0) + 1)
    expect((await notificationsOf('user-qa-1')).map((n) => n.title)).toContain('Dev ส่งมอบงาน พร้อมให้ทดสอบ')
  })

  it('restores the spec of an earlier version as a new one', async () => {
    const tc = await caseOf('TC-103')
    const edited = (
      await as('user-qa-1')
        .patch('/projects/proj-1/test-cases/TC-103')
        .send({ patch: { name: 'ชื่อชั่วคราว' }, expected: expectOf(tc) })
    ).body.data.testCase
    const res = await as('user-qa-1')
      .post(`/projects/proj-1/test-cases/TC-103/versions/${tc.version}/restore`)
      .send({ expected: expectOf(edited) })
    expect(res.status).toBe(200)
    expect(res.body.data.testCase).toMatchObject({
      name: tc.name,
      version: 'v' + edited.version.slice(1).replace(/\d+$/, (n: string) => String(Number(n) + 1)),
    })
  })

  it('extends a due date with a reason, without a new version', async () => {
    const tc = await caseOf('TC-104')
    const res = await as('user-dev-1')
      .patch('/projects/proj-1/test-cases/TC-104/due-date')
      .send({ newDate: '2026-12-31', reason: 'รอ API ธนาคาร', expected: expectOf(tc) })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ oldDate: tc.expiryDate, testCase: { expiryDate: '2026-12-31', version: tc.version } })
    expect((await as('user-dev-1').patch('/projects/proj-1/test-cases/TC-104/due-date').send({ newDate: '2026-12-31', reason: '' })).status).toBe(400)
  })
})

describe('requirements and review', () => {
  it('flags the cases of a requirement whose meaning changed; reviewing clears it', async () => {
    const req = ((await as('user-qa-1').get('/requirements')).body.data as { id: string; code: string }[]).find((r) => r.code === 'REQ-PAY-01')!
    const { body } = await as('user-qa-1').put(`/requirements/${req.id}`).send({
      code: 'REQ-PAY-01',
      title: 'ชื่อใหม่ของ Requirement',
      description: '',
      type: 'functional',
      priority: 'critical',
      status: 'changed',
      acceptanceCriteria: [],
    })
    const flagged = (body.data.flaggedCases as TestCase[]).map((c) => c.id)
    expect(flagged).toContain('TC-101')
    const tc = await caseOf('TC-101')
    expect(tc.reviewNeeded).toMatchObject({ requirementCodes: ['REQ-PAY-01'] })

    const res = await as('user-qa-1')
      .post('/projects/proj-1/test-cases/TC-101/review')
      .send({ expected: expectOf(tc) })
    expect(res.body.data.cleared.requirementCodes).toEqual(['REQ-PAY-01'])
    expect((await caseOf('TC-101')).reviewNeeded).toBeUndefined()
  })
})

describe('archive, delete and impact', () => {
  it('archives a case with its sub-cases, restores it, and deletes only archived ones', async () => {
    const tc = await caseOf('TC-101')
    expect((await as('user-qa-1').delete('/projects/proj-1/test-cases/TC-101').send({})).status).toBe(409)
    const archived = await as('user-qa-1')
      .post('/projects/proj-1/test-cases/TC-101/archive')
      .send({ expected: expectOf(tc) })
    expect(archived.body.data.map((c: TestCase) => c.id)).toEqual(['TC-101', 'TC-101-1'])
    const restored = await as('user-qa-1').post('/projects/proj-1/test-cases/TC-101/restore').send({})
    expect(restored.body.data.every((c: TestCase) => !c.archivedAt)).toBe(true)

    await as('user-qa-1').post('/projects/proj-1/test-cases/TC-104/archive').send({})
    expect((await as('user-qa-2').delete('/projects/proj-1/test-cases/TC-104').send({})).status).toBe(403)
    const deleted = await as('user-qa-1').delete('/projects/proj-1/test-cases/TC-104').send({})
    expect(deleted.body.data).toEqual(['TC-104'])
    expect((await auditOf('TC-104')).every((e) => e.targetDeleted)).toBe(true)
  })

  it('tells what archiving touches: requirements left without a case', async () => {
    const res = await as('user-qa-1').get('/projects/proj-1/test-cases/TC-101/impact')
    expect(res.body.data).toMatchObject({ caseIds: ['TC-101', 'TC-101-1'], openDefects: [] })
    // the runs that hold it come from the run module
    expect(res.body.data.runs).toContainEqual({ name: 'Sprint 42 · Regression', round: 2, open: true })
    expect(res.body.data.requirements).toContainEqual(expect.objectContaining({ code: 'REQ-PAY-01' }))
  })
})

describe('reordering', () => {
  it('renumbers in the given order and re-keys the history of each case', async () => {
    const before = await casesOf()
    const res = await as('user-qa-1')
      .put('/projects/proj-1/test-cases/order')
      .send({
        order: [
          { id: 'TC-103', subIds: [] },
          { id: 'TC-101', subIds: ['TC-101-1'] },
          { id: 'TC-104', subIds: [] },
        ],
        uids: Object.fromEntries(before.map((c) => [c.id, c.uid])),
      })
    expect(res.status).toBe(200)
    expect(res.body.data.renames).toEqual({ 'TC-103': 'TC-101', 'TC-101': 'TC-102', 'TC-101-1': 'TC-102-1', 'TC-104': 'TC-103' })
    const after = await casesOf()
    expect(after.map((c) => [c.id, c.uid])).toEqual([
      ['TC-101', before[2]!.uid],
      ['TC-102', before[0]!.uid],
      ['TC-102-1', before[1]!.uid],
      ['TC-103', before[3]!.uid],
    ])
  })

  it('refuses an order made from a list someone renumbered since', async () => {
    const before = await casesOf()
    const uids = Object.fromEntries(before.map((c) => [c.id, c.uid]))
    uids['TC-101'] = 'tc-someone-else'
    const res = await as('user-qa-1')
      .put('/projects/proj-1/test-cases/order')
      .send({
        order: before.filter((c) => !c.parentId).map((c) => ({ id: c.id, subIds: before.filter((s) => s.parentId === c.id).map((s) => s.id) })),
        uids,
      })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('stale')
  })
})

describe('due-date alerts', () => {
  it('announce cases due soon once a day, to the people who want to hear that early', async () => {
    const tc = await caseOf('TC-103')
    await as('user-qa-1')
      .patch('/projects/proj-1/test-cases/TC-103/due-date')
      .send({ newDate: addDays(new Date().toISOString().slice(0, 10), 5), reason: 'เลื่อน', expected: expectOf(tc) })
    await as('user-qa-1').delete('/notifications')
    await announceDueDates()
    await announceDueDates()
    const dueAlerts = async () => (await notificationsOf('user-qa-1')).filter((n) => n.type === 'EXPIRING' && n.testCaseId === 'TC-103')
    // default: warned 3 days ahead
    expect(await dueAlerts()).toEqual([])
    const settings = (await as('user-qa-1').get('/me/settings')).body.data
    await as('user-qa-1')
      .put('/me/settings')
      .send({ ...settings, expiryDaysThreshold: 7 })
    expect((await dueAlerts()).map((n) => n.title)).toEqual(['Test Case ใกล้ครบกำหนด'])
  })
})
