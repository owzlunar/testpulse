import type { DocumentRecord, DocumentRequest, DocumentSearchHit, DocumentSnapshot, DocumentTemplate, Signatory } from '@/types'
import { ApiError } from '@/api/errors'
import { DEFAULT_TEMPLATE, buildSnapshot, uatBlock } from '@/domain/document'
import { newId } from '@/utils/ids'
import { defectsOf } from './defect'
import { respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan, storedProjects } from './project'
import { requirementsOf } from './requirement'
import { runsOf } from './run'
import { STORAGE_KEYS, load, save } from './storage'
import { storedCases } from './test-case'

// --- snapshot (built on the server by the same rule) ---------------------------------
function snapshotOf(req: Pick<DocumentRequest, 'projectId' | 'type' | 'options'>): DocumentSnapshot {
  // read through each owner's loader: a bare load(key, []) would store [] over data not seeded yet
  const project = storedProjects().find((p) => p.id === req.projectId)
  if (!project) throw new ApiError('ไม่พบโปรเจกต์', 404)
  const run = req.options.runId ? runsOf(req.projectId).find((r) => r.id === req.options.runId) : undefined
  if (req.options.runId && !run) throw new ApiError('ไม่พบรอบการทดสอบที่เลือก', 404)
  return buildSnapshot(req, {
    project,
    cases: storedCases().filter((c) => c.projectId === req.projectId),
    run,
    defects: defectsOf(req.projectId),
    requirements: requirementsOf(req.projectId),
  })
}

/** Release gatekeeper (422) */
function assertReleasable(doc: Pick<DocumentRecord, 'uat'>, snapshot: DocumentSnapshot) {
  const block = uatBlock(doc.uat, snapshot.risks)
  if (block) throw new ApiError(block, 422)
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

/** GET /documents/search?q=:q&limit=:limit&offset=:offset */
export const searchDocuments = (q: string, limit = 20, offset = 0) =>
  respond(() => {
    const text = q.trim().toLowerCase()
    if (!text || !sessionCan('document.view')) return { documents: [] as DocumentSearchHit[], total: 0 }
    const found = inAccessibleProjects(documents())
      .filter((d) => `${d.docNumber} ${d.title}`.toLowerCase().includes(text))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const hits = found.slice(offset, offset + limit).map(({ id, projectId, type, title, docNumber, version, status, updatedAt }) => ({
      id,
      projectId,
      type,
      title,
      docNumber,
      version,
      status,
      updatedAt,
    }))
    return { documents: hits, total: found.length }
  })

/** POST /documents (the server collects the data and freezes it in `snapshot`) */
export const generateDocument = (req: DocumentRequest, createdBy: string) =>
  respond(() => {
    assertCan('document.create', req.projectId)
    const now = new Date().toISOString()
    const snapshot = snapshotOf(req)
    assertReleasable(req, snapshot)
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
    const snapshot = snapshotOf(doc)
    assertReleasable(doc, snapshot)
    Object.assign(doc, {
      snapshot,
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
