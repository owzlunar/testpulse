import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Requirement, TestCase } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'
import { RequirementModel } from '../requirement.model.js'
import { requirementOrigin } from '../../../migrations/20261005-01-requirement-origin.js'

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const codesOf = async (userId: string) => ((await as(userId).get('/requirements')).body.data as Requirement[]).map((r) => r.code)
const body = (over: Record<string, unknown> = {}) => ({
  code: 'REQ-PAY-90',
  title: 'คืนเงินบางส่วน',
  description: '',
  type: 'functional',
  priority: 'medium',
  status: 'draft',
  acceptanceCriteria: ['คืนได้ไม่เกินยอดที่จ่าย'],
  ...over,
})

describe('requirements', () => {
  it('lists those of the projects one may open', async () => {
    expect(await codesOf('user-qa-1')).toContain('REQ-PAY-01')
    expect(await codesOf('user-qa-1')).not.toContain('REQ-SHOP-01')
    expect(await codesOf('user-qa-2')).not.toContain('REQ-PAY-01')
  })

  it('searches code, title and description', async () => {
    const res = await as('user-qa-1').get('/requirements/search?q=webhook')
    expect(res.body.data.requirements.map((r: Requirement) => r.code)).toContain('REQ-PAY-04')
    expect((await as('user-qa-2').get('/requirements/search?q=webhook')).body.data.total).toBe(0)
  })

  it('creates with a code free in the project; needs requirement.edit and the project', async () => {
    const res = await as('user-qa-1').post('/projects/proj-1/requirements').send(body())
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ requirement: { code: 'REQ-PAY-90', projectId: 'proj-1' }, flaggedCases: [] })
    expect((await as('user-qa-1').post('/projects/proj-1/requirements').send(body())).status).toBe(409)
    expect(
      (
        await as('user-qa-2')
          .post('/projects/proj-1/requirements')
          .send(body({ code: 'REQ-PAY-91' }))
      ).status,
    ).toBe(403)
  })

  it('a change of type or status flags nothing; deleting flags its cases', async () => {
    const req = ((await as('user-qa-1').get('/requirements')).body.data as Requirement[]).find((r) => r.code === 'REQ-PAY-01')!
    const { id: _id, projectId: _p, createdAt: _c, updatedAt: _u, ...fields } = req
    const statusOnly = await as('user-qa-1')
      .put(`/requirements/${req.id}`)
      .send({ ...fields, status: 'changed' })
    expect(statusOnly.body.data.flaggedCases).toEqual([])
    const deleted = await as('user-qa-1').delete(`/requirements/${req.id}`)
    expect((deleted.body.data.flaggedCases as TestCase[]).map((c) => c.id)).toContain('TC-101')
    expect(await codesOf('user-qa-1')).not.toContain('REQ-PAY-01')
  })

  it('a TOR requirement names its clause; an additional one has none', async () => {
    const tor = await as('user-qa-1')
      .post('/projects/proj-1/requirements')
      .send(body({ origin: 'tor', torClause: ' 4.5.2 ' }))
    expect(tor.body.data.requirement).toMatchObject({ origin: 'tor', torClause: '4.5.2' })
    const noClause = await as('user-qa-1')
      .post('/projects/proj-1/requirements')
      .send(body({ code: 'REQ-PAY-91', origin: 'tor' }))
    expect(noClause.status).toBe(400)
    // older clients send no origin: what they add is on top of the TOR, and a stray clause is dropped
    const older = await as('user-qa-1')
      .post('/projects/proj-1/requirements')
      .send(body({ code: 'REQ-PAY-92', torClause: '9.9' }))
    expect(older.body.data.requirement.origin).toBe('additional')
    expect(older.body.data.requirement.torClause).toBeUndefined()

    const { id, projectId: _p, createdAt: _c, updatedAt: _u, ...fields } = tor.body.data.requirement as Requirement
    const moved = await as('user-qa-1')
      .put(`/requirements/${id}`)
      .send({ ...fields, origin: 'additional' })
    expect(moved.body.data.requirement.origin).toBe('additional')
    expect(moved.body.data.requirement.torClause).toBeUndefined()
  })

  it('searches the TOR clause too', async () => {
    const res = await as('user-qa-1').get('/requirements/search?q=4.2.1')
    expect(res.body.data.requirements.map((r: Requirement) => r.code)).toEqual(['REQ-PAY-04'])
  })

  it('the migration makes requirements without an origin additional ones', async () => {
    await RequirementModel.collection.updateMany({ projectId: 'proj-1' }, { $unset: { origin: 1 } })
    await requirementOrigin.up()
    const list = (await as('user-qa-1').get('/requirements')).body.data as Requirement[]
    expect(list.filter((r) => r.projectId === 'proj-1').every((r) => r.origin === 'additional')).toBe(true)
    // the rest keep theirs
    expect((await RequirementModel.findOne({ code: 'REQ-SHOP-01' }).lean())?.origin).toBe('tor')
  })

  describe('import', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      title: 'นำเข้า',
      description: '',
      type: 'functional',
      priority: 'medium',
      status: 'draft',
      origin: 'additional',
      acceptanceCriteria: [],
      ...over,
    })
    const importAs = (userId: string, requirements: unknown[], updateExisting = false) =>
      as(userId).post('/projects/proj-1/requirements/import').send({ requirements, updateExisting })

    it('numbers rows without a code after the highest one; existing codes are skipped', async () => {
      const res = await importAs('user-qa-1', [
        row({ title: 'TOR ข้อ 7.1', origin: 'tor', torClause: '7.1' }),
        row({ code: 'REQ-PAY-01', title: 'ชื่อใหม่' }),
        row({ code: 'REQ-PAY-50', title: 'มีรหัสเอง' }),
        row({ title: 'ไม่มีรหัส' }),
      ])
      expect(res.status).toBe(200)
      expect(res.body.data.created.map((r: Requirement) => r.code)).toEqual(['REQ-PAY-07', 'REQ-PAY-50', 'REQ-PAY-51'])
      expect(res.body.data.created[0]).toMatchObject({ origin: 'tor', torClause: '7.1' })
      expect(res.body.data).toMatchObject({ updated: [], skipped: ['REQ-PAY-01'], flaggedCases: [] })
      expect((await as('user-qa-1').get('/requirements')).body.data.find((r: Requirement) => r.code === 'REQ-PAY-01').title).not.toBe('ชื่อใหม่')
    })

    it('updates existing codes when asked: a new meaning flags their cases, once for the import', async () => {
      const res = await importAs('user-qa-1', [row({ code: 'REQ-PAY-01', title: 'สร้าง QR แบบใหม่', origin: 'tor', torClause: '4.1.1' })], true)
      expect(res.body.data.updated[0]).toMatchObject({ code: 'REQ-PAY-01', title: 'สร้าง QR แบบใหม่' })
      expect((res.body.data.flaggedCases as TestCase[]).map((c) => c.id)).toContain('TC-101')
    })

    it('refuses the same code twice, a TOR row without a clause, and people without requirement.edit', async () => {
      expect((await importAs('user-qa-1', [row({ code: 'X-1' }), row({ code: 'X-1' })])).status).toBe(422)
      expect((await importAs('user-qa-1', [row({ origin: 'tor' })])).status).toBe(400)
      expect((await importAs('user-dev-1', [row()])).status).toBe(403)
      expect((await importAs('user-qa-2', [row()])).status).toBe(403)
    })
  })
})
