import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AuditTrailEntry, Project, ProjectReport } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

// proj-1 (payment): run-1 completed, run-2 in progress (newer); BUG-001..003 open, BUG-004 closed.
// user-qa-1 QA Lead · user-qa-2 QA Tester (e-commerce only) · user-dev-1 Developer.

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const reportOf = async (userId: string, projectId = 'proj-1'): Promise<ProjectReport> =>
  (await as(userId).get(`/projects/${projectId}/report`)).body.data

describe('project report', () => {
  it('sums up the active cases as the project card does, with the runs and open defects', async () => {
    const report = await reportOf('user-dev-1')
    const card = ((await as('user-dev-1').get('/projects')).body.data as Project[]).find((p) => p.id === 'proj-1')!
    expect(report.stats).toEqual(card.caseStats)
    expect(report.mainCases + report.subCases).toBe(report.stats.total)
    expect(Object.values(report.byPriority).reduce((a, b) => a + b, 0)).toBe(report.stats.total)
    expect(report.runs).toMatchObject({ total: 2, open: 1, latest: { id: 'run-2', name: 'Sprint 42 · Regression', status: 'in_progress' } })
    expect(report.defects).toMatchObject({ total: 4, open: 3 })
    expect(Object.values(report.defects.openBySeverity).reduce((a, b) => a + b, 0)).toBe(3)
  })

  it('by environment: the primary is the cases’ status, another its latest results there; code vs server defects', async () => {
    const run = (
      await as('user-qa-1')
        .post('/projects/proj-1/test-runs')
        .send({ name: 'UAT', type: 'uat', round: 1, environmentId: 'env-staging', caseIds: ['TC-101', 'TC-104'] })
    ).body.data
    const verdict = (status: string) => ({ status, stepResults: [], actualResults: '', evidence: [], defectIds: [], notes: '' })
    await as('user-qa-1').put(`/test-runs/${run.id}/results/TC-101`).send(verdict('passed'))
    await as('user-qa-1').put(`/test-runs/${run.id}/results/TC-104`).send(verdict('blocked'))
    const bug = { title: 'Port 443 ถูกปิด', severity: 'critical', status: 'open', environmentId: 'env-staging', cause: 'environment', evidence: [] }
    await as('user-qa-1').post('/projects/proj-1/defects').send(bug)

    const report = await reportOf('user-qa-1')
    const [test, staging] = report.environments
    expect(test).toMatchObject({ id: 'env-test', primary: true, passed: report.stats.passed })
    expect(staging).toMatchObject({ id: 'env-staging', name: 'STAGING', primary: false, passed: 1, blocked: 1, failed: 0 })
    expect(staging!.notRun).toBe(report.stats.total - 2)
    expect(report.defects.byCause.environment).toMatchObject({ total: 1, open: 1, avgFixHours: null })
    expect(report.defects.byCause.code).toMatchObject({ total: 4, open: 3 })
  })

  it('leaves archived cases out', async () => {
    const before = await reportOf('user-qa-1')
    await as('user-qa-1').post('/projects/proj-1/test-cases/TC-104/archive').send({})
    expect((await reportOf('user-qa-1')).stats.total).toBe(before.stats.total - 1)
  })

  it('needs report.view and the project', async () => {
    expect((await as('user-qa-2').get('/projects/proj-1/report')).status).toBe(403)
    expect((await as('user-qa-1').get('/projects/proj-404/report')).status).toBe(404)
  })
})

describe('exports', () => {
  it('are recorded by the server for those who may read the cases', async () => {
    const res = await as('user-dev-1').post('/projects/proj-1/exports').send({ format: 'markdown', filename: 'PAY_TestCases_2026-10-04.md' })
    expect(res.status).toBe(200)
    const audit = (await as('user-admin').get('/audit-logs')).body.data as AuditTrailEntry[]
    expect(audit.find((e) => e.action === 'EXPORT' && e.targetId === 'proj-1')).toMatchObject({
      userId: 'user-dev-1',
      details: 'ส่งออก Test Case ของ PromptPay & QR Payment Gateway v3 เป็น Obsidian Markdown (.md) (PAY_TestCases_2026-10-04.md)',
    })
    expect((await as('user-qa-2').post('/projects/proj-1/exports').send({ format: 'markdown', filename: 'x.md' })).status).toBe(403)
    expect((await as('user-qa-1').post('/projects/proj-1/exports').send({ format: 'pdf', filename: 'x.pdf' })).status).toBe(400)
  })
})
