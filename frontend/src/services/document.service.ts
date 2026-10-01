import type {
  Defect, DocCase, DocumentRecord, DocumentRequest, DocumentSnapshot, DocumentStatus, DocumentTemplate, DocumentType,
  Option, Project, Requirement, Signatory, TestCase, TestRun, UatDecision,
} from '@/types'
import { todayISO } from '@/utils/date'
import { isOpenDefect } from './defect.service'
import { ApiError, newId, respond } from './http'
import { casesForRequirement, coverageStatus, requirementText } from './requirement.service'
import { resultOf } from './run.service'
import { inAccessibleProjects } from './project.service'
import { STORAGE_KEYS, load, save } from './storage.service'
import { isOverdue, statusOf } from './test-case.service'

export const DOCUMENT_TYPES: (Option<DocumentType> & { description: string; code: string })[] = [
  { value: 'uat', code: 'UAT', label: 'UAT Sign-off', hint: 'เอกสารตรวจรับระบบ', icon: 'tabler:certificate', tone: 'success',
    description: 'สรุปผลการตรวจรับ มติ (ผ่าน / มีเงื่อนไข / ไม่ผ่าน) Defect ที่ค้าง และช่องลงนามผู้ส่งมอบและผู้รับมอบ' },
  { value: 'test_summary', code: 'TSR', label: 'Test Summary Report', hint: 'รายงานผลรอบการทดสอบ', icon: 'tabler:report-analytics', tone: 'primary',
    description: 'ผลของรอบทดสอบ: Pass rate, ผลรายเคส, Defect ที่พบ และรายละเอียดเคสที่ไม่ผ่านพร้อมหลักฐาน' },
  { value: 'test_spec', code: 'TSP', label: 'Test Specification', hint: 'เอกสารกรณีทดสอบ', icon: 'tabler:file-description', tone: 'info',
    description: 'รายละเอียด Test Case ทั้งหมด: Requirement, Scenario, Prerequisite และตารางขั้นตอน ใช้ส่งให้ลูกค้าตรวจก่อนทดสอบ' },
  { value: 'rtm', code: 'RTM', label: 'Traceability Matrix', hint: 'ตารางความครอบคลุม', icon: 'tabler:table', tone: 'warning',
    description: 'ตาราง Requirement ↔ Test Case พร้อมสถานะความครอบคลุม ใช้ยืนยันว่าทุก Requirement ถูกทดสอบ' },
]

export const DOCUMENT_STATUSES: Option<DocumentStatus>[] = [
  { value: 'draft', label: 'ฉบับร่าง', tone: 'secondary', icon: 'tabler:pencil' },
  { value: 'pending_signoff', label: 'รอลงนาม', tone: 'warning', icon: 'tabler:signature' },
  { value: 'signed', label: 'ลงนามครบแล้ว', tone: 'success', icon: 'tabler:rosette-discount-check' },
  { value: 'rejected', label: 'ถูกปฏิเสธ', tone: 'error', icon: 'tabler:circle-x' },
]

export const UAT_DECISIONS: (Option<UatDecision> & { full: string })[] = [
  { value: 'accepted', label: 'ผ่านการตรวจรับ', full: 'FULL ACCEPTANCE (ผ่านการตรวจรับสมบูรณ์)', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'conditional', label: 'ผ่านแบบมีเงื่อนไข', full: 'CONDITIONAL ACCEPTANCE (รับมอบแบบมีเงื่อนไข)', tone: 'warning', icon: 'tabler:alert-triangle' },
  { value: 'rejected', label: 'ไม่ผ่านการตรวจรับ', full: 'REJECTED (ไม่ผ่านการตรวจรับ)', tone: 'error', icon: 'tabler:circle-x' },
]

export const documentTypeOf = (v: DocumentType) => DOCUMENT_TYPES.find((t) => t.value === v) ?? DOCUMENT_TYPES[0]
export const documentStatusOf = (v: DocumentStatus) => DOCUMENT_STATUSES.find((s) => s.value === v) ?? DOCUMENT_STATUSES[0]
export const uatDecisionOf = (v: UatDecision) => UAT_DECISIONS.find((d) => d.value === v) ?? UAT_DECISIONS[0]

export const DEFAULT_TEMPLATE: DocumentTemplate = {
  companyName: 'บริษัท เทสต์พัลส์ เทคโนโลยี จำกัด',
  companyAddress: '999 อาคารดิจิทัล ชั้น 12 ถนนพระราม 9 กรุงเทพฯ 10310',
  logo: '',
  docNumberPattern: '{TYPE}-{KEY}-{YYYYMMDD}-{NN}',
  headerNote: 'เอกสารนี้จัดทำโดยระบบ TestPulse จากผลการทดสอบจริงในระบบ',
  footerNote: 'เอกสารภายใน · ห้ามเผยแพร่โดยไม่ได้รับอนุญาต',
  defaultSignatories: [
    { role: 'ผู้จัดทำ (ผู้ส่งมอบ)', position: 'QA Lead' },
    { role: 'ผู้ตรวจสอบ', position: 'Project Manager' },
    { role: 'ผู้อนุมัติ (ผู้รับมอบ)', position: 'Product Owner' },
  ],
}

/** "{TYPE}-{KEY}-{YYYYMMDD}-{NN}" -> "UAT-PAY-20261001-01" */
export function formatDocNumber(pattern: string, type: DocumentType, key: string, seq: number): string {
  return pattern
    .replace('{TYPE}', documentTypeOf(type).code)
    .replace('{KEY}', key)
    .replace('{YYYYMMDD}', todayISO().replace(/-/g, ''))
    .replace('{YYYY}', todayISO().slice(0, 4))
    .replace('{NN}', String(seq).padStart(2, '0'))
}

// --- snapshot builder (server-side on the real backend) ------------------------------
const outcomeOf = (status: string): DocCase['outcome'] =>
  status === 'passed' || status === 'failed' || status === 'blocked' ? status : 'not_run'

function buildSnapshot(req: DocumentRequest): DocumentSnapshot {
  const project = load<Project[]>(STORAGE_KEYS.projects, []).find((p) => p.id === req.projectId)
  if (!project) throw new ApiError('ไม่พบโปรเจกต์', 404)
  const projectCases = load<TestCase[]>(STORAGE_KEYS.testCases, []).filter((c) => c.projectId === req.projectId)
  // archived cases are out of scope (lists, coverage); a run still shows the ones it executed
  const allCases = projectCases.filter((c) => !c.archivedAt)
  const run = req.options.runId ? load<TestRun[]>(STORAGE_KEYS.testRuns, []).find((r) => r.id === req.options.runId) : undefined
  if (req.options.runId && !run) throw new ApiError('ไม่พบรอบการทดสอบที่เลือก', 404)
  const defects = load<Defect[]>(STORAGE_KEYS.defects, []).filter((d) => d.projectId === req.projectId)
  const requirements = load<Requirement[]>(STORAGE_KEYS.requirements, []).filter((r) => r.projectId === req.projectId)

  const sortId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, undefined, { numeric: true })
  let cases: DocCase[]
  if (run) {
    cases = run.results.map((r) => {
      const tc = r.caseDeleted ? undefined : projectCases.find((c) => c.id === r.caseId)
      const res = resultOf(r.status)
      return {
        id: r.caseDeleted ? `${r.caseId} (ลบแล้ว)` : r.caseId, name: r.caseName, parentId: tc?.parentId, requirement: tc ? requirementText(tc, requirements) : '', testScenario: tc?.testScenario ?? '',
        prerequisite: tc?.prerequisite ?? '', priority: r.priority, steps: r.steps, expectedResults: tc?.expectedResults ?? '',
        outcome: outcomeOf(r.status), result: res.label, resultTone: res.tone, actualResults: r.actualResults, executedBy: r.executedBy, executedAt: r.executedAt,
        stepResults: r.stepResults, evidence: [...r.evidence, ...r.stepResults.flatMap((s) => s.evidence)], defectIds: r.defectIds,
      }
    })
  } else {
    cases = allCases.map((tc) => {
      const st = statusOf(tc.status)
      return {
        id: tc.id, name: tc.name, parentId: tc.parentId, requirement: requirementText(tc, requirements), testScenario: tc.testScenario, prerequisite: tc.prerequisite,
        priority: tc.priority, steps: tc.steps, expectedResults: tc.expectedResults, outcome: outcomeOf(tc.status), result: st.label, resultTone: st.tone,
        actualResults: tc.actualResults, executedBy: tc.executedBy, executedAt: tc.executedAt, evidence: [...tc.expectedImages, ...tc.actualImages],
        defectIds: defects.filter((d) => d.caseId === tc.id).map((d) => d.id),
      }
    })
  }
  if (!req.options.includeSubCases) cases = cases.filter((c) => !c.parentId)
  if (!req.options.includeEvidence) cases = cases.map((c) => ({ ...c, evidence: [], stepResults: c.stepResults?.map((s) => ({ ...s, evidence: [] })) }))
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
    run: run && { name: run.name, round: run.round, type: run.type, environment: run.environment, build: run.build, plannedStart: run.plannedStart, plannedEnd: run.plannedEnd, startedAt: run.startedAt, completedAt: run.completedAt },
    summary: { total: cases.length, passed, failed, blocked, notRun: cases.length - passed - failed - blocked, passRate: cases.length ? (passed / cases.length) * 100 : 0 },
    cases,
    defects: (req.options.includeDefects ? defects.filter((d) => !d.caseId || d.caseDeleted || caseIds.has(d.caseId)) : []).map(({ id, title, severity, status, caseId, caseDeleted, assignee, externalKey }) => ({ id, title, severity, status, caseId: caseId && caseDeleted ? `${caseId} (ลบแล้ว)` : caseId, assignee, externalKey })),
    requirements: req.options.includeTraceability || req.type === 'rtm'
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
export const fetchDocuments = () => respond(() => inAccessibleProjects(documents()))

/** POST /documents (the server collects the data and freezes it in `snapshot`) */
export const generateDocument = (req: DocumentRequest, createdBy: string) =>
  respond(() => {
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
    return write(list, Object.assign(find(list, id), patch))
  })

/** POST /documents/:id/signatures/:index  { decision, comment } */
export const signDocument = (id: string, index: number, decision: 'signed' | 'rejected', comment = '') =>
  respond(() => {
    const list = documents()
    const doc = find(list, id)
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
    if (find(list, id).status === 'signed') throw new ApiError('เอกสารที่ลงนามแล้วลบไม่ได้', 409)
    save(STORAGE_KEYS.documents, list.filter((d) => d.id !== id))
  })

/** GET /organization/document-template */
export const fetchDocumentTemplate = () => respond(() => ({ ...DEFAULT_TEMPLATE, ...load(STORAGE_KEYS.documentTemplate, DEFAULT_TEMPLATE) }))

/** PUT /organization/document-template */
export const saveDocumentTemplate = (tpl: DocumentTemplate) => respond(() => (save(STORAGE_KEYS.documentTemplate, tpl), tpl))
