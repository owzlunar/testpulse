import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Defect, DocumentSearchHit, Requirement, RunSearchHit, TestCase } from '#contract/types.js'
import { TestCaseModel } from '#modules/test-case/test-case.model.js'
import { useTestDatabase } from '../helpers/database.js'
import { buildApp, client, seedDemo } from '../helpers/app.js'

// The universal search: every group pages by offset, in the projects the user may open.
// proj-1 (payment): BUG-001..004, run-1 / run-2 "Sprint 42 · …", REQ-PAY-04 "Webhook Retry …".
// user-qa-1 QA Lead (team Payment) · user-qa-2 QA Tester (E-Commerce only).

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const search = async <T>(userId: string, path: string) => (await as(userId).get(path)).body.data as T

describe('universal search', () => {
  it('defects: by id or title, newest first, a page at a time', async () => {
    const all = await search<{ defects: Defect[]; total: number }>('user-qa-1', '/defects/search?q=bug-00&limit=50')
    expect(all.total).toBeGreaterThanOrEqual(4)
    const first = await search<{ defects: Defect[]; total: number }>('user-qa-1', '/defects/search?q=bug-00&limit=2')
    const second = await search<{ defects: Defect[]; total: number }>('user-qa-1', '/defects/search?q=bug-00&limit=2&offset=2')
    expect([...first.defects, ...second.defects].map((d) => d.id)).toEqual(all.defects.slice(0, 4).map((d) => d.id))
    expect(first.total).toBe(all.total)
    expect((await search<{ defects: Defect[] }>('user-qa-2', '/defects/search?q=bug-001')).defects.filter((d) => d.projectId === 'proj-1')).toEqual(
      [],
    )
  })

  it('runs and documents come without their results / snapshot', async () => {
    const runs = await search<{ runs: RunSearchHit[]; total: number }>('user-qa-1', '/test-runs/search?q=sprint%2042')
    expect(runs.runs.map((r) => r.id)).toEqual(['run-2', 'run-1'])
    expect(runs.runs[0]).not.toHaveProperty('results')

    await as('user-qa-1')
      .post('/documents')
      .send({
        projectId: 'proj-1',
        type: 'rtm',
        title: 'ตารางความครอบคลุม',
        docNumber: 'RTM-PAY-01',
        options: { includeSubCases: true, includeSteps: false, includeEvidence: false, includeDefects: false, includeTraceability: true },
        signatories: [],
      })
    const docs = await search<{ documents: DocumentSearchHit[]; total: number }>('user-qa-1', '/documents/search?q=rtm-pay')
    expect(docs).toMatchObject({ total: 1, documents: [{ docNumber: 'RTM-PAY-01', status: 'draft' }] })
    expect(docs.documents[0]).not.toHaveProperty('snapshot')
  })

  it('test cases match their linked requirement ("CODE: title"), and page by offset', async () => {
    const req = (await search<{ requirements: Requirement[] }>('user-qa-1', '/requirements/search?q=REQ-PAY-04')).requirements[0]!
    await TestCaseModel.updateOne({ projectId: 'proj-1', id: 'TC-103' }, { $set: { requirementIds: [req.id] } })
    const linked = await search<{ cases: TestCase[] }>('user-qa-1', `/test-cases?search=${encodeURIComponent('REQ-PAY-04: Webhook')}`)
    expect(linked.cases.map((c) => c.id)).toEqual(['TC-103'])

    const all = await search<{ cases: TestCase[]; total: number }>('user-qa-1', '/test-cases?search=tc-&limit=100')
    const page = await search<{ cases: TestCase[]; total: number }>('user-qa-1', '/test-cases?search=tc-&limit=2&offset=2')
    expect(page.cases.map((c) => c.uid)).toEqual(all.cases.slice(2, 4).map((c) => c.uid))
    expect(page.total).toBe(all.total)
  })

  it('requirements page by offset; a regex character matches itself', async () => {
    const all = await search<{ requirements: Requirement[]; total: number }>('user-qa-1', '/requirements/search?q=req-&limit=100')
    const page = await search<{ requirements: Requirement[] }>('user-qa-1', '/requirements/search?q=req-&limit=3&offset=1')
    expect(page.requirements.map((r) => r.id)).toEqual(all.requirements.slice(1, 4).map((r) => r.id))
    expect((await search<{ total: number }>('user-qa-1', '/requirements/search?q=.*')).total).toBe(0)
  })

  it('a negative offset or a huge page is refused', async () => {
    expect((await as('user-qa-1').get('/defects/search?q=bug&offset=-1')).status).toBe(400)
    expect((await as('user-qa-1').get('/documents/search?q=x&limit=1000')).status).toBe(400)
  })
})
