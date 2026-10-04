import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AuditTrailEntry, DocumentRecord, DocumentTemplate, NotificationItem } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

// proj-1 (payment) has open risks: TC-103 failed, TC-104 blocked, open defects. Runs: run-1 completed,
// run-2 in progress. user-qa-1 QA Lead (document.create + sign) · user-qa-2 QA Tester (create, no
// sign; e-commerce only) · user-dev-1 Developer (view only).

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const as = (userId: string) => client(app).as(userId)
const LEAD = 'สมชาย ประเสริฐ (QA Lead)'
const request = (over: Record<string, unknown> = {}) => ({
  projectId: 'proj-1',
  type: 'test_summary',
  title: 'สรุปผล Sprint 42',
  docNumber: 'TSR-PAY-20261003-01',
  options: { runId: 'run-1', includeSubCases: true, includeSteps: true, includeEvidence: false, includeDefects: true, includeTraceability: false },
  signatories: [
    { role: 'ผู้จัดทำ', name: LEAD, position: 'QA Lead', status: 'signed' },
    { role: 'ผู้อนุมัติ', name: 'คุณลูกค้า', position: 'Product Owner' },
  ],
  ...over,
})
const generate = async (over: Record<string, unknown> = {}): Promise<DocumentRecord> =>
  (await as('user-qa-1').post('/documents').send(request(over))).body.data
const titlesFor = async (userId: string) => ((await as(userId).get('/notifications')).body.data as NotificationItem[]).map((n) => n.title)

describe('generating', () => {
  it('freezes the run on the server, by the signed-in user, with no signature yet', async () => {
    const res = await as('user-qa-1')
      .post('/documents')
      .send({ ...request(), createdBy: 'someone else', status: 'signed' })
    expect(res.status).toBe(201)
    const doc = res.body.data as DocumentRecord
    expect(doc).toMatchObject({ status: 'draft', version: 1, createdBy: LEAD })
    expect(doc.signatories.map((s) => s.status)).toEqual(['pending', 'pending'])
    expect(doc.snapshot.run).toMatchObject({ name: 'Sprint 42 · Functional', round: 1 })
    expect(doc.snapshot.cases.find((c) => c.id === 'TC-103')).toMatchObject({ outcome: 'failed', result: 'Fail', resultTone: 'error' })
    expect(doc.snapshot.summary.failed).toBeGreaterThan(0)
    expect(doc.snapshot.risks).toContain(`มีเคสไม่ผ่าน ${doc.snapshot.summary.failed} เคส`)

    const audit = (await as('user-admin').get('/audit-logs')).body.data as AuditTrailEntry[]
    expect(audit.find((e) => e.targetId === 'TSR-PAY-20261003-01')).toMatchObject({
      action: 'EXPORT',
      details: 'สร้างเอกสาร TSR-PAY-20261003-01 (Test Summary Report)',
    })
  })

  it('prints the cases themselves when no run is chosen, and the traceability matrix', async () => {
    const doc = await generate({ type: 'rtm', options: { ...request().options, runId: '', includeSubCases: false } })
    expect(doc.snapshot.run).toBeUndefined()
    expect(doc.snapshot.cases.every((c) => !c.parentId)).toBe(true)
    expect(doc.snapshot.requirements.find((r) => r.code === 'REQ-PAY-04')).toMatchObject({ caseIds: ['TC-104'] })
  })

  it('TOR only: the TOR requirements by clause, and only the cases that test them', async () => {
    const doc = await generate({ type: 'uat', options: { ...request().options, runId: '', includeTraceability: true, torOnly: true } })
    expect(doc.snapshot.requirements.map((r) => `${r.torClause} ${r.code}`)).toEqual([
      '4.1.1 REQ-PAY-01',
      '4.1.2 REQ-PAY-02',
      '4.2.1 REQ-PAY-04',
      '4.3 REQ-PAY-05',
    ])
    // TC-103 tests REQ-PAY-03 (additional); a sub-case goes with its parent
    expect(doc.snapshot.cases.map((c) => c.id)).toEqual(['TC-101', 'TC-101-1', 'TC-104'])
  })

  it('needs document.create and the project; a run of another project is not found', async () => {
    expect((await as('user-dev-1').post('/documents').send(request())).status).toBe(403)
    expect((await as('user-qa-2').post('/documents').send(request())).status).toBe(403)
    const other = await as('user-admin')
      .post('/documents')
      .send(request({ projectId: 'proj-2' }))
    expect(other.status).toBe(404)
  })

  it('UAT: open risks rule out full acceptance and must be acknowledged (Release gatekeeper)', async () => {
    const uat = { testPeriod: '1-3 ต.ค.', environment: 'UAT', decision: 'accepted', remarks: '', riskAcknowledged: true }
    const accepted = await as('user-qa-1')
      .post('/documents')
      .send(request({ type: 'uat', uat }))
    expect(accepted.status).toBe(422)
    expect(accepted.body.message).toMatch(/^ไม่สามารถตรวจรับแบบสมบูรณ์ได้: มีเคสไม่ผ่าน/)
    const unacknowledged = await as('user-qa-1')
      .post('/documents')
      .send(request({ type: 'uat', uat: { ...uat, decision: 'conditional', riskAcknowledged: false } }))
    expect(unacknowledged.status).toBe(422)
    expect(
      (
        await as('user-qa-1')
          .post('/documents')
          .send(request({ type: 'uat', uat: { ...uat, decision: 'conditional' } }))
      ).status,
    ).toBe(201)
  })
})

describe('listing', () => {
  it('shows the documents of the projects one may open', async () => {
    const doc = await generate()
    expect(((await as('user-dev-1').get('/documents')).body.data as DocumentRecord[]).map((d) => d.id)).toEqual([doc.id])
    expect((await as('user-qa-2').get('/documents')).body.data).toEqual([])
  })
})

describe('signing off', () => {
  it('a draft is sent to its signatories, who sign line by line; the last signature tells the project', async () => {
    const doc = await generate()
    const sent = await as('user-qa-1').patch(`/documents/${doc.id}`).send({ status: 'pending_signoff' })
    expect(sent.body.data.status).toBe('pending_signoff')
    // the QA Lead is one of the signatories, but the sender is not told about their own change
    expect(await titlesFor('user-qa-1')).not.toContain('เอกสารรอลงนาม')
    expect((await as('user-qa-1').patch(`/documents/${doc.id}`).send({ title: 'อื่น' })).status).toBe(409)

    expect((await as('user-qa-2').post(`/documents/${doc.id}/signatures/0`).send({ decision: 'signed' })).status).toBe(403)
    const first = await as('user-qa-1').post(`/documents/${doc.id}/signatures/0`).send({ decision: 'signed' })
    expect(first.body.data).toMatchObject({
      status: 'pending_signoff',
      signatories: [{ status: 'signed', signedAt: expect.any(String) }, { status: 'pending' }],
    })
    expect((await as('user-qa-1').post(`/documents/${doc.id}/signatures/0`).send({ decision: 'rejected' })).status).toBe(409)
    const last = await as('user-qa-1').post(`/documents/${doc.id}/signatures/1`).send({ decision: 'signed', comment: 'ok' })
    expect(last.body.data.status).toBe('signed')
    expect(await titlesFor('user-dev-1')).toContain('เอกสารลงนามครบแล้ว')

    expect((await as('user-qa-1').delete(`/documents/${doc.id}`)).status).toBe(409)
  })

  it('a signatory with an account hears that a document awaits them', async () => {
    const doc = await generate({ signatories: [{ role: 'ผู้ตรวจสอบ', name: 'กิตติศักดิ์ พัฒนา (Dev Lead)', position: 'Dev Lead' }] })
    await as('user-qa-1').patch(`/documents/${doc.id}`).send({ status: 'pending_signoff' })
    expect(await titlesFor('user-dev-1')).toContain('เอกสารรอลงนาม')
    expect(await titlesFor('user-dev-2')).not.toContain('เอกสารรอลงนาม')
  })

  it('one rejection rejects the document; a new version starts the signatures again', async () => {
    const doc = await generate()
    await as('user-qa-1').patch(`/documents/${doc.id}`).send({ status: 'pending_signoff' })
    const rejected = await as('user-qa-1').post(`/documents/${doc.id}/signatures/1`).send({ decision: 'rejected', comment: 'ขาดหลักฐาน' })
    expect(rejected.body.data).toMatchObject({
      status: 'rejected',
      signatories: [{ status: 'pending' }, { status: 'rejected', comment: 'ขาดหลักฐาน' }],
    })

    const regenerated = await as('user-qa-1').post(`/documents/${doc.id}/regenerate`)
    expect(regenerated.body.data).toMatchObject({ status: 'draft', version: 2 })
    expect(regenerated.body.data.signatories.map((s: { status: string }) => s.status)).toEqual(['pending', 'pending'])
  })

  it('a draft without signatories cannot be sent; a draft can be deleted', async () => {
    const doc = await generate({ signatories: [] })
    expect((await as('user-qa-1').patch(`/documents/${doc.id}`).send({ status: 'pending_signoff' })).status).toBe(422)
    expect((await as('user-dev-1').delete(`/documents/${doc.id}`)).status).toBe(403)
    expect((await as('user-qa-1').delete(`/documents/${doc.id}`)).status).toBe(200)
    expect((await as('user-qa-1').get('/documents')).body.data).toEqual([])
  })
})

describe('template', () => {
  const template = (over: Partial<DocumentTemplate> = {}): DocumentTemplate => ({
    companyName: 'บริษัท ทดสอบ จำกัด',
    companyAddress: 'กรุงเทพฯ',
    logo: '/api/v1/files/file-abc/content',
    docNumberPattern: '{TYPE}-{KEY}-{NN}',
    headerNote: '',
    footerNote: '',
    defaultSignatories: [{ role: 'ผู้อนุมัติ', position: 'CTO' }],
    ...over,
  })

  it('starts from the defaults and keeps what is saved', async () => {
    expect((await as('user-dev-1').get('/organization/document-template')).body.data.docNumberPattern).toBe('{TYPE}-{KEY}-{YYYYMMDD}-{NN}')
    expect((await as('user-dev-1').put('/organization/document-template').send(template())).status).toBe(403)
    expect((await as('user-qa-1').put('/organization/document-template').send(template())).status).toBe(200)
    expect((await as('user-dev-1').get('/organization/document-template')).body.data).toEqual(template())
  })

  it('takes an uploaded logo by URL, never the picture itself', async () => {
    const res = await as('user-qa-1')
      .put('/organization/document-template')
      .send(template({ logo: 'data:image/png;base64,AAAA' }))
    expect(res.status).toBe(400)
  })
})
