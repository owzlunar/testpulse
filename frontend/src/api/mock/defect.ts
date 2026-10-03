import type { Defect, DefectComment, DefectInput } from '@/types'
import { ApiError } from '@/api/errors'
import { respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan } from './project'
import { SEED_DEFECTS } from './seeds/defects.seed'
import { STORAGE_KEYS, load, save } from './storage'

// --- API ------------------------------------------------------------------------
const defects = () => load(STORAGE_KEYS.defects, SEED_DEFECTS)

/** server-side: follow renumbered case ids (old id -> new id) in the project's defects */
export function renameDefectCases(projectId: string, renames: Record<string, string>) {
  const list = defects()
  list.forEach((d) => {
    if (d.projectId === projectId && d.caseId && !d.caseDeleted) d.caseId = renames[d.caseId] ?? d.caseId
  })
  save(STORAGE_KEYS.defects, list)
}

/** server-side: defects of deleted cases keep the id as history, detached from it */
export function detachDefectCases(projectId: string, caseIds: string[]) {
  const list = defects()
  list.forEach((d) => {
    if (d.projectId === projectId && d.caseId && caseIds.includes(d.caseId)) d.caseDeleted = true
  })
  save(STORAGE_KEYS.defects, list)
}

/** GET /defects/search?q=:q&limit=:limit&offset=:offset */
export const searchDefects = (q: string, limit = 20, offset = 0) =>
  respond(() => {
    const text = q.trim().toLowerCase()
    if (!text || !sessionCan('defect.view')) return { defects: [] as Defect[], total: 0 }
    const found = inAccessibleProjects(defects())
      .filter((d) => `${d.id} ${d.title} ${d.externalKey ?? ''} ${d.caseId ?? ''}`.toLowerCase().includes(text))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { defects: found.slice(offset, offset + limit), total: found.length }
  })

/** server-side: the stored defects of a project */
export const defectsOf = (projectId: string): Defect[] => defects().filter((d) => d.projectId === projectId)

/** GET /defects (of the projects the signed-in user may open) */
export const fetchDefects = () => respond(() => (sessionCan('defect.view') ? inAccessibleProjects(defects()) : []))

/** POST /projects/:projectId/defects · PUT /defects/:id */
export const saveDefect = (input: DefectInput, reportedBy: string) =>
  respond(() => {
    const list = defects()
    const now = new Date().toISOString()
    // closing / rejecting is a verdict (defect.resolve); reporting and progress updates are defect.report
    const before = input.id ? list.find((d) => d.id === input.id) : undefined
    const resolving = (input.status === 'closed' || input.status === 'rejected') && input.status !== before?.status
    assertCan(resolving ? 'defect.resolve' : 'defect.report', before?.projectId ?? input.projectId)
    if (input.id) {
      const i = list.findIndex((d) => d.id === input.id)
      if (i < 0) throw new ApiError('ไม่พบ Defect', 404)
      // picking another case re-attaches a defect whose case was deleted
      const caseDeleted = input.caseId === list[i].caseId ? list[i].caseDeleted : false
      list[i] = { ...list[i], ...input, id: input.id, caseDeleted, updatedAt: now }
      save(STORAGE_KEYS.defects, list)
      return list[i]
    }
    const next = list.reduce((m, d) => Math.max(m, Number(d.id.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1
    const created: Defect = { ...input, id: `BUG-${String(next).padStart(3, '0')}`, reportedBy, comments: [], createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.defects, [created, ...list])
    return created
  })

/** POST /defects/:id/comments */
export const addDefectComment = (id: string, comment: DefectComment) =>
  respond(() => {
    const list = defects()
    const d = list.find((x) => x.id === id)
    if (!d) throw new ApiError('ไม่พบ Defect', 404)
    assertCan('defect.report', d.projectId)
    d.comments.push(comment)
    d.updatedAt = comment.at
    save(STORAGE_KEYS.defects, list)
    return d
  })
