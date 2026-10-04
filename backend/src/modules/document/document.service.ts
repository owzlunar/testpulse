import type {
  DocumentRecord,
  DocumentRequest,
  DocumentSearchHit,
  DocumentSnapshot,
  DocumentTemplate,
  PermissionKey,
  Signatory,
} from '#contract/types.js'
import { DEFAULT_TEMPLATE, buildSnapshot, uatBlock } from '#contract/rules/document.js'
import { environmentOf } from '#contract/rules/project.js'
import { runEnvironmentId } from '#contract/rules/run.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import { assertCan } from '#core/auth/guards.js'
import { can, type Principal } from '#core/auth/principal.js'
import { ApiError } from '#core/http/errors.js'
import { searchPattern } from '#core/http/search.js'
import { notify } from '#core/notify/notify-sink.js'
import { defects } from '#modules/defect/index.js'
import { projectAccess } from '#modules/project/index.js'
import { requirements } from '#modules/requirement/index.js'
import { runs } from '#modules/run/index.js'
import { testCases } from '#modules/test-case/index.js'
import { accounts } from '#modules/user/index.js'
import { documentRepository } from './document.repository.js'

export type DocumentPatch = Partial<Pick<DocumentRecord, 'title' | 'docNumber' | 'signatories' | 'uat' | 'status'>>

const TYPE_LABELS: Record<DocumentRecord['type'], string> = {
  uat: 'UAT Sign-off',
  test_summary: 'Test Summary Report',
  test_spec: 'Test Specification',
  rtm: 'Traceability Matrix',
}

async function found(id: string): Promise<DocumentRecord> {
  const doc = await documentRepository.findById(id)
  if (!doc) throw ApiError.notFound('ไม่พบเอกสาร')
  return doc
}

async function guard(p: Principal, projectId: string, need: PermissionKey) {
  assertCan(p, need)
  return projectAccess.assert(p, projectId)
}

/** signatures start (again) empty: who signs is named, the signing itself happens later */
const unsigned = (list: Pick<Signatory, 'role' | 'name' | 'position'>[]): Signatory[] =>
  list.map(({ role, name, position }) => ({ role, name, position, status: 'pending' }))

/** the project's data now, as the document prints it; the Release gatekeeper checks UAT sign-offs (422) */
async function snapshotOf(p: Principal, doc: Pick<DocumentRecord, 'projectId' | 'type' | 'options' | 'uat'>): Promise<DocumentSnapshot> {
  const project = await projectAccess.assert(p, doc.projectId)
  const [cases, runList, defectList, requirementList] = await Promise.all([
    testCases.ofProject(doc.projectId),
    runs.ofProject(doc.projectId),
    defects.ofProject(doc.projectId),
    requirements.ofProject(doc.projectId),
  ])
  const run = doc.options.runId ? runList.find((r) => r.id === doc.options.runId) : undefined
  if (doc.options.runId && !run) throw ApiError.notFound('ไม่พบรอบการทดสอบที่เลือก')
  // a UAT on an environment: one of the project's (the server names it), and a run on it
  if (doc.uat?.environmentId) {
    const env = environmentOf(project, doc.uat.environmentId)
    if (!env) throw ApiError.unprocessable('ไม่พบ Environment นี้ในโปรเจกต์')
    if (run && runEnvironmentId(run, project) !== env.id) throw ApiError.unprocessable(`รอบที่เลือกทดสอบบน ${run.environment} ไม่ใช่ ${env.name}`)
    doc.uat.environment = env.name
  }
  const snapshot = buildSnapshot(doc, { project, cases, run, runs: runList, defects: defectList, requirements: requirementList })
  const block = uatBlock(doc.uat, snapshot.risks)
  if (block) throw ApiError.unprocessable(block)
  return snapshot
}

const exported = (doc: DocumentRecord, details: string) =>
  recordAudit({ action: 'EXPORT', targetType: 'PROJECT', targetId: doc.docNumber, targetTitle: doc.title, projectId: doc.projectId, details })

export const documentService = {
  /** GET /documents: of the projects the user may open, latest change first */
  async list(p: Principal): Promise<DocumentRecord[]> {
    if (!p.roleId || !can(p, 'document.view')) return []
    return documentRepository.ofProjects([...(await projectAccess.accessibleIds(p))])
  },

  /** GET /documents/search: document number or title, in the projects the user may open; latest change first */
  async search(p: Principal, q: string, limit: number, offset: number): Promise<{ documents: DocumentSearchHit[]; total: number }> {
    const text = q.trim()
    if (!text || !p.roleId || !can(p, 'document.view')) return { documents: [], total: 0 }
    const pattern = searchPattern(text)
    const { items, total } = await documentRepository.findPage(
      { projectId: { $in: [...(await projectAccess.accessibleIds(p))] }, $or: [{ docNumber: pattern }, { title: pattern }] },
      { updatedAt: -1 },
      limit,
      offset,
      'projectId type title docNumber version status updatedAt',
    )
    return { documents: items as DocumentSearchHit[], total }
  },

  /** POST /documents: the server collects the data and freezes it in `snapshot` */
  async generate(p: Principal, req: DocumentRequest): Promise<DocumentRecord> {
    await guard(p, req.projectId, 'document.create')
    const snapshot = await snapshotOf(p, req)
    const doc = await documentRepository.create({
      ...req,
      signatories: unsigned(req.signatories),
      version: 1,
      status: 'draft',
      snapshot,
      createdBy: p.name,
    })
    await exported(doc, `สร้างเอกสาร ${doc.docNumber} (${TYPE_LABELS[doc.type]})`)
    return doc
  },

  /** POST /documents/:id/regenerate: a new version with fresh data; signatures reset */
  async regenerate(p: Principal, id: string): Promise<DocumentRecord> {
    const before = await found(id)
    await guard(p, before.projectId, 'document.create')
    const snapshot = await snapshotOf(p, before)
    const doc = (await documentRepository.update(id, {
      snapshot,
      version: before.version + 1,
      status: 'draft',
      signatories: unsigned(before.signatories),
    }))!
    await exported(doc, `สร้าง ${doc.docNumber} เวอร์ชัน ${doc.version} จากข้อมูลล่าสุด`)
    return doc
  },

  /**
   * PATCH /documents/:id: a draft's details, or sending it for sign-off (draft -> pending_signoff,
   * the signatories with an account are told). Signed or pending documents change only by a new version.
   */
  async update(p: Principal, id: string, patch: DocumentPatch): Promise<DocumentRecord> {
    const before = await found(id)
    await guard(p, before.projectId, 'document.create')
    if (before.status !== 'draft') throw ApiError.conflict('แก้ไขได้เฉพาะฉบับร่าง (สร้างเวอร์ชันใหม่เพื่อแก้ไข)')
    const fields: DocumentPatch = { ...patch }
    if (patch.signatories) fields.signatories = unsigned(patch.signatories)
    const signatories = fields.signatories ?? before.signatories
    if (patch.status === 'pending_signoff' && !signatories.length) throw ApiError.unprocessable('ต้องมีผู้ลงนามอย่างน้อย 1 คน')
    if (patch.uat) {
      // the results were frozen from this environment: another one needs a new version
      fields.uat = { ...patch.uat, environmentId: before.uat?.environmentId, environment: before.uat?.environment ?? patch.uat.environment }
      const block = uatBlock(fields.uat, before.snapshot.risks)
      if (block) throw ApiError.unprocessable(block)
    }
    const doc = await documentRepository.update(id, fields, { status: 'draft' })
    if (!doc) throw ApiError.conflict('เอกสารถูกเปลี่ยนสถานะไปแล้ว')

    if (patch.status === 'pending_signoff') {
      await exported(doc, `ส่ง ${doc.docNumber} ขอลงนาม ${doc.signatories.length} คน`)
      // the sender knows (the app confirms it to them)
      const userIds = (await accounts.idsByName(doc.signatories.map((s) => s.name).filter(Boolean))).filter((uid) => uid !== p.id)
      if (userIds.length) {
        await notify({
          type: 'SYSTEM',
          title: 'เอกสารรอลงนาม',
          message: `${doc.docNumber} ${doc.title}`,
          projectId: doc.projectId,
          to: { userIds },
          severity: 'info',
        })
      }
    }
    return doc
  },

  /** POST /documents/:id/signatures/:index: while it awaits sign-off, a line still pending; one rejection rejects the document */
  async sign(p: Principal, id: string, index: number, decision: 'signed' | 'rejected', comment = ''): Promise<DocumentRecord> {
    const before = await found(id)
    await guard(p, before.projectId, 'document.sign')
    if (before.status !== 'pending_signoff') throw ApiError.conflict('เอกสารนี้ไม่ได้อยู่ระหว่างรอลงนาม')
    const signer = before.signatories[index]
    if (!signer) throw ApiError.notFound('ไม่พบผู้ลงนาม')
    if (signer.status !== 'pending') throw ApiError.conflict('ผู้ลงนามนี้ลงนามหรือปฏิเสธไปแล้ว')

    const signatories = before.signatories.map((s, i) => (i === index ? { ...s, status: decision, signedAt: new Date().toISOString(), comment } : s))
    const status = decision === 'rejected' ? 'rejected' : signatories.every((s) => s.status === 'signed') ? 'signed' : 'pending_signoff'
    const doc = await documentRepository.update(
      id,
      { signatories, status },
      { status: 'pending_signoff', [`signatories.${index}.status`]: 'pending' },
    )
    if (!doc) throw ApiError.conflict('ผู้ลงนามนี้ลงนามหรือปฏิเสธไปแล้ว')

    await exported(
      doc,
      `${signer.name || signer.role} ${decision === 'signed' ? 'ลงนาม' : 'ปฏิเสธ'} ${doc.docNumber}${comment ? ` (${comment})` : ''}`,
    )
    if (doc.status === 'signed') {
      await notify({
        type: 'SYSTEM',
        title: 'เอกสารลงนามครบแล้ว',
        message: `${doc.docNumber} ${doc.title}`,
        projectId: doc.projectId,
        severity: 'success',
      })
    }
    return doc
  },

  /** DELETE /documents/:id: a signed document stays */
  async remove(p: Principal, id: string): Promise<void> {
    const doc = await found(id)
    await guard(p, doc.projectId, 'document.create')
    if (doc.status === 'signed') throw ApiError.conflict('เอกสารที่ลงนามแล้วลบไม่ได้')
    await documentRepository.remove(id)
    await recordAudit({
      action: 'DELETE',
      targetType: 'PROJECT',
      targetId: doc.docNumber,
      targetTitle: doc.title,
      projectId: doc.projectId,
      details: `ลบเอกสาร ${doc.docNumber}`,
    })
  },

  /** GET /organization/document-template: the defaults, overridden by what was saved */
  async template(): Promise<DocumentTemplate> {
    const saved = await documentRepository.template()
    const keys = Object.keys(DEFAULT_TEMPLATE) as (keyof DocumentTemplate)[]
    return Object.fromEntries(keys.map((k) => [k, saved?.[k] ?? DEFAULT_TEMPLATE[k]])) as unknown as DocumentTemplate
  },

  /** PUT /organization/document-template */
  async saveTemplate(p: Principal, template: DocumentTemplate): Promise<DocumentTemplate> {
    assertCan(p, 'document.create')
    await documentRepository.saveTemplate(template)
    return documentService.template()
  },
}
