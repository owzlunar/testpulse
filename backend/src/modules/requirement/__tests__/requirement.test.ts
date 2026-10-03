import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Requirement, TestCase } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

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
})
