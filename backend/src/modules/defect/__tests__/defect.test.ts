import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Defect, NotificationItem } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

// Demo defects of proj-1: BUG-001 retest (TC-103, assigned to user-dev-1 by name) · BUG-002 open
// (TC-101-1, user-dev-2) · BUG-003 in progress (TC-104) · BUG-004 closed.
// user-qa-1 QA Lead (defect.resolve) · user-qa-2 QA Tester (e-commerce) · user-dev-1 Developer (no resolve)

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const defectsOf = async (userId: string): Promise<Defect[]> => (await as(userId).get('/defects')).body.data
const defectOf = async (id: string) => (await defectsOf('user-qa-1')).find((d) => d.id === id)!
const report = (over: Record<string, unknown> = {}) => ({
  title: 'ยอดเงินแสดงทศนิยมผิด',
  description: '',
  stepsToReproduce: '1. ชำระ 10.5 บาท',
  expected: '10.50',
  actual: '10.5',
  severity: 'major',
  status: 'open',
  caseId: 'TC-103',
  assignee: 'กิตติศักดิ์ พัฒนา (Dev Lead)',
  evidence: [],
  ...over,
})
const fieldsOf = ({ id: _i, projectId: _p, createdAt: _c, updatedAt: _u, comments: _cm, reportedBy: _r, caseDeleted: _d, ...fields }: Defect) =>
  fields

describe('defects', () => {
  it('are listed for the projects one may open', async () => {
    expect((await defectsOf('user-qa-1')).map((d) => d.id)).toEqual(expect.arrayContaining(['BUG-001', 'BUG-004']))
    expect((await defectsOf('user-qa-2')).filter((d) => d.projectId === 'proj-1')).toEqual([])
  })

  it('are numbered after the last one, stamped with the reporter, and the assigned developer is told', async () => {
    const res = await as('user-qa-1').post('/projects/proj-1/defects').send(report())
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ id: 'BUG-005', reportedBy: 'สมชาย ประเสริฐ (QA Lead)', comments: [] })
    expect(((await as('user-dev-1').get('/notifications')).body.data as NotificationItem[]).map((n) => n.title)).toContain('Defect ใหม่ BUG-005')
    const [a, b] = await Promise.all([
      as('user-qa-1').post('/projects/proj-1/defects').send(report()),
      as('user-qa-1').post('/projects/proj-1/defects').send(report()),
    ])
    expect(new Set([a.body.data.id, b.body.data.id]).size).toBe(2)
  })

  it('link only to cases of the project', async () => {
    expect(
      (
        await as('user-qa-1')
          .post('/projects/proj-1/defects')
          .send(report({ caseId: 'TC-201' }))
      ).status,
    ).toBe(422)
    expect((await as('user-qa-2').post('/projects/proj-1/defects').send(report())).status).toBe(403)
  })

  it('a developer moves one along but cannot close it; a QA Lead can', async () => {
    const bug = await defectOf('BUG-002')
    expect(
      (
        await as('user-dev-1')
          .put('/defects/BUG-002')
          .send({ ...fieldsOf(bug), status: 'fixed' })
      ).status,
    ).toBe(200)
    expect(
      (
        await as('user-dev-1')
          .put('/defects/BUG-002')
          .send({ ...fieldsOf(bug), status: 'closed' })
      ).status,
    ).toBe(403)
    expect(
      (
        await as('user-qa-1')
          .put('/defects/BUG-002')
          .send({ ...fieldsOf(bug), status: 'closed' })
      ).body.data.status,
    ).toBe('closed')
  })

  it('take comments from the signed-in user', async () => {
    const res = await as('user-dev-1').post('/defects/BUG-001/comments').send({ text: 'แก้แล้วใน rc3', by: 'someone else' })
    expect(res.body.data.comments.at(-1)).toMatchObject({ by: 'กิตติศักดิ์ พัฒนา (Dev Lead)', text: 'แก้แล้วใน rc3' })
  })
})

describe('following the cases', () => {
  it('open defects show in a case impact; deleting the case leaves them as history', async () => {
    const impact = (await as('user-qa-1').get('/projects/proj-1/test-cases/TC-104/impact')).body.data
    expect(impact.openDefects).toEqual([{ id: 'BUG-003', title: (await defectOf('BUG-003')).title }])
    await as('user-qa-1').post('/projects/proj-1/test-cases/TC-104/archive').send({})
    await as('user-qa-1').delete('/projects/proj-1/test-cases/TC-104').send({})
    expect(await defectOf('BUG-003')).toMatchObject({ caseId: 'TC-104', caseDeleted: true })
  })

  it('follow renumbered cases', async () => {
    await as('user-qa-1')
      .put('/projects/proj-1/test-cases/order')
      .send({
        order: [
          { id: 'TC-103', subIds: [] },
          { id: 'TC-101', subIds: ['TC-101-1'] },
          { id: 'TC-104', subIds: [] },
        ],
      })
    expect((await defectOf('BUG-001')).caseId).toBe('TC-101')
    expect((await defectOf('BUG-002')).caseId).toBe('TC-102-1')
  })
})
