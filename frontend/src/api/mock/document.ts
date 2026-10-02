import type { DocCase, DocumentRecord, DocumentRequest, DocumentSnapshot, DocumentTemplate, Signatory } from '@/types'
import { ApiError } from '@/api/errors'
import { isOpenDefect } from '@/domain/defect'
import { DEFAULT_TEMPLATE } from '@/domain/document'
import { casesForRequirement, coverageStatus, requirementText } from '@/domain/requirement'
import { resultOf } from '@/domain/run'
import { isOverdue, statusOf } from '@/domain/test-case'
import { newId } from '@/utils/ids'
import { defectsOf } from './defect'
import { respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan, storedProjects } from './project'
import { requirementsOf } from './requirement'
import { runsOf } from './run'
import { STORAGE_KEYS, load, save } from './storage'
import { storedCases } from './test-case'

// --- snapshot builder (server-side on the real backend) ------------------------------
const outcomeOf = (status: string): DocCase['outcome'] => (status === 'passed' || status === 'failed' || status === 'blocked' ? status : 'not_run')

function buildSnapshot(req: DocumentRequest): DocumentSnapshot {
  // read through each owner's loader: a bare load(key, []) would store [] over data not seeded yet
  const project = storedProjects().find((p) => p.id === req.projectId)
  if (!project) throw new ApiError('ไม่พบโปรเจกต์', 404)
  const projectCases = storedCases().filter((c) => c.projectId === req.projectId)
  // archived cases are out of scope (lists, coverage); a run still shows the ones it executed
  const allCases = projectCases.filter((c) => !c.archivedAt)
  const run = req.options.runId ? runsOf(req.projectId).find((r) => r.id === req.options.runId) : undefined
  if (req.options.runId && !run) throw new ApiError('ไม่พบรอบการทดสอบที่เลือก', 404)
  const defects = defectsOf(req.projectId)
  const requirements = requirementsOf(req.projectId)

  const sortId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, undefined, { numeric: true })
  let cases: DocCase[]
  if (run) {
    cases = run.results.map((r) => {
      const tc = r.caseDeleted ? undefined : projectCases.find((c) => c.id === r.caseId)
      const res = resultOf(r.status)
      return {
        id: r.caseDeleted ? `${r.caseId} (ลบแล้ว)` : r.caseId,
        name: r.caseName,
        parentId: tc?.parentId,
        requirement: tc ? requirementText(tc, requirements) : '',
        testScenario: tc?.testScenario ?? '',
        prerequisite: tc?.prerequisite ?? '',
        priority: r.priority,
        steps: r.steps,
        expectedResults: tc?.expectedResults ?? '',
        outcome: outcomeOf(r.status),
        result: res.label,
        resultTone: res.tone,
        actualResults: r.actualResults,
        executedBy: r.executedBy,
        executedAt: r.executedAt,
        stepResults: r.stepResults,
        evidence: [...r.evidence, ...r.stepResults.flatMap((s) => s.evidence)],
        defectIds: r.defectIds,
      }
    })
  } else {
    cases = allCases.map((tc) => {
      const st = statusOf(tc.status)
      return {
        id: tc.id,
        name: tc.name,
        parentId: tc.parentId,
        requirement: requirementText(tc, requirements),
        testScenario: tc.testScenario,
        prerequisite: tc.prerequisite,
        priority: tc.priority,
        steps: tc.steps,
        expectedResults: tc.expectedResults,
        outcome: outcomeOf(tc.status),
        result: st.label,
        resultTone: st.tone,
        actualResults: tc.actualResults,
        executedBy: tc.executedBy,
        executedAt: tc.executedAt,
        evidence: [...tc.expectedImages, ...tc.actualImages],
        defectIds: defects.filter((d) => d.caseId === tc.id).map((d) => d.id),
      }
    })
  }
  if (!req.options.includeSubCases) cases = cases.filter((c) => !c.parentId)
  if (!req.options.includeEvidence)
    cases = cases.map((c) => ({ ...c, evidence: [], stepResults: c.stepResults?.map((s) => ({ ...s, evidence: [] })) }))
  cases.sort(sortId)

  const count = (o: DocCase['outcome']) => cases.filter((c) => c.outcome === o).length
  const passed = count('passed')
  const failed = count('failed')
  const blocked = count('blocked')
  const caseIds = new Set(cases.map((c) => c.id))
  const openDefects = defects.filter((d) => isOpenDefect(d) && (!d.caseId || d.caseDeleted || caseIds.has(d.caseId)))
  const overdue = allCases.filter((c) => caseIds.has(c.id) && isOverdue(c))

  const risks = [
    failed && `มีเคสไม่ผ่าน ${failed} เคส`,
    blocked && `มีเคสที่ทดสอบไม่ได้ (Blocked) ${blocked} เคส`,
    overdue.length && `มีเคสเลยกำหนดส่งมอบ ${overdue.length} เคส`,
    openDefects.length && `มี Defect ที่ยังเปิดอยู่ ${openDefects.length} รายการ`,
  ].filter(Boolean) as string[]

  return {
    generatedAt: new Date().toISOString(),
    project: { name: project.name, key: project.key, description: project.description, targetDeadline: project.targetDeadline },
    run: run && {
      name: run.name,
      round: run.round,
      type: run.type,
      environment: run.environment,
      build: run.build,
      plannedStart: run.plannedStart,
      plannedEnd: run.plannedEnd,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    },
    summary: {
      total: cases.length,
      passed,
      failed,
      blocked,
      notRun: cases.length - passed - failed - blocked,
      passRate: cases.length ? (passed / cases.length) * 100 : 0,
    },
    cases,
    defects: (req.options.includeDefects ? defects.filter((d) => !d.caseId || d.caseDeleted || caseIds.has(d.caseId)) : []).map(
      ({ id, title, severity, status, caseId, caseDeleted, assignee, externalKey }) => ({
        id,
        title,
        severity,
        status,
        caseId: caseId && caseDeleted ? `${caseId} (ลบแล้ว)` : caseId,
        assignee,
        externalKey,
      }),
    ),
    requirements:
      req.options.includeTraceability || req.type === 'rtm'
        ? requirements.map((r) => {
            const linked = casesForRequirement(r, allCases)
            return { code: r.code, title: r.title, caseIds: linked.map((c) => c.id), coverage: coverageStatus(linked) }
          })
        : [],
    risks,
  }
}

// --- API ------------------------------------------------------------------------
const documents = () => load<DocumentRecord[]>(STORAGE_KEYS.documents, [])

const find = (list: DocumentRecord[], id: string) => {
  const doc = list.find((d) => d.id === id)
  if (!doc) throw new ApiError('ไม่พบเอกสาร', 404)
  return doc
}

const write = (list: DocumentRecord[], doc: DocumentRecord) => {
  doc.updatedAt = new Date().toISOString()
  save(STORAGE_KEYS.documents, list)
  return doc
}

/** GET /documents */
export const fetchDocuments = () => respond(() => (sessionCan('document.view') ? inAccessibleProjects(documents()) : []))

/** POST /documents (the server collects the data and freezes it in `snapshot`) */
export const generateDocument = (req: DocumentRequest, createdBy: string) =>
  respond(() => {
    assertCan('document.create', req.projectId)
    const now = new Date().toISOString()
    const snapshot = buildSnapshot(req)
    // Release gatekeeper: a release with open risks can't be fully accepted
    if (req.uat?.decision === 'accepted' && snapshot.risks.length) {
      throw new ApiError(`ไม่สามารถตรวจรับแบบสมบูรณ์ได้: ${snapshot.risks.join(', ')}`, 422)
    }
    if (req.uat && snapshot.risks.length && !req.uat.riskAcknowledged) throw new ApiError('ต้องยืนยันรับทราบความเสี่ยงก่อนสร้างเอกสาร UAT', 422)
    const doc: DocumentRecord = { ...req, id: newId('doc'), version: 1, status: 'draft', snapshot, createdBy, createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.documents, [doc, ...documents()])
    return doc
  }, 900)

/** POST /documents/:id/regenerate (new version with fresh data; signatures reset) */
export const regenerateDocument = (id: string) =>
  respond(() => {
    const list = documents()
    const doc = find(list, id)
    assertCan('document.create', doc.projectId)
    Object.assign(doc, {
      snapshot: buildSnapshot(doc),
      version: doc.version + 1,
      status: 'draft',
      signatories: doc.signatories.map((s) => ({ ...s, status: 'pending', signedAt: undefined, comment: undefined })),
    })
    return write(list, doc)
  }, 900)

/** PATCH /documents/:id */
export const updateDocument = (id: string, patch: Partial<Pick<DocumentRecord, 'title' | 'docNumber' | 'signatories' | 'uat' | 'status'>>) =>
  respond(() => {
    const list = documents()
    const doc = find(list, id)
    assertCan('document.create', doc.projectId)
    return write(list, Object.assign(doc, patch))
  })

/** POST /documents/:id/signatures/:index  { decision, comment } */
export const signDocument = (id: string, index: number, decision: 'signed' | 'rejected', comment = '') =>
  respond(() => {
    const list = documents()
    const doc = find(list, id)
    assertCan('document.sign', doc.projectId)
    const signer: Signatory | undefined = doc.signatories[index]
    if (!signer) throw new ApiError('ไม่พบผู้ลงนาม', 404)
    Object.assign(signer, { status: decision, signedAt: new Date().toISOString(), comment })
    doc.status = decision === 'rejected' ? 'rejected' : doc.signatories.every((s) => s.status === 'signed') ? 'signed' : 'pending_signoff'
    return write(list, doc)
  })

/** DELETE /documents/:id (drafts only) */
export const deleteDocument = (id: string) =>
  respond(() => {
    const list = documents()
    assertCan('document.create', find(list, id).projectId)
    if (find(list, id).status === 'signed') throw new ApiError('เอกสารที่ลงนามแล้วลบไม่ได้', 409)
    save(
      STORAGE_KEYS.documents,
      list.filter((d) => d.id !== id),
    )
  })

/** GET /organization/document-template */
export const fetchDocumentTemplate = () => respond(() => ({ ...DEFAULT_TEMPLATE, ...load(STORAGE_KEYS.documentTemplate, DEFAULT_TEMPLATE) }))

/** PUT /organization/document-template */
export const saveDocumentTemplate = (tpl: DocumentTemplate) =>
  respond(() => {
    assertCan('document.create')
    save(STORAGE_KEYS.documentTemplate, tpl)
    return tpl
  })
