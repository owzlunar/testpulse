import type { Requirement, RequirementChangeResult, RequirementImportResult, RequirementImportRow, RequirementInput, TestCase } from '@/types'
import { meaningChanges, nextRequirementCode } from '@/domain/requirement'
import { ApiError } from '@/api/errors'
import { newId } from '@/utils/ids'
import { respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan, storedProjects } from './project'
import { SEED_REQUIREMENTS } from './seeds/requirements.seed'
import { STORAGE_KEYS, load, migrateOnce, save } from './storage'
import { flagCasesForReview } from './test-case'

// --- API ------------------------------------------------------------------------
function requirements(): Requirement[] {
  // stored before requirements had an origin: they were added on top of the TOR
  migrateOnce('requirement-origin-v1', () => {
    const list = load(STORAGE_KEYS.requirements, SEED_REQUIREMENTS)
    save(
      STORAGE_KEYS.requirements,
      list.map((r) => ({ ...r, origin: r.origin ?? 'additional' })),
    )
  })
  return load(STORAGE_KEYS.requirements, SEED_REQUIREMENTS)
}

/** server-side: the stored requirements of a project */
export const requirementsOf = (projectId: string): Requirement[] => requirements().filter((r) => r.projectId === projectId)

/** GET /requirements (of the projects the signed-in user may open) */
export const fetchRequirements = () => respond(() => (sessionCan('requirement.view') ? inAccessibleProjects(requirements()) : []))

/** GET /requirements/search?q=:q&limit=:limit (code, TOR clause, title or description, in the projects the user may open) */
export const searchRequirements = (q: string, limit = 20, offset = 0) =>
  respond(() => {
    const text = q.trim().toLowerCase()
    if (!text || !sessionCan('requirement.view')) return { requirements: [] as Requirement[], total: 0 }
    const found = inAccessibleProjects(requirements()).filter((r) =>
      `${r.code} ${r.torClause ?? ''} ${r.title} ${r.description}`.toLowerCase().includes(text),
    )
    return { requirements: found.slice(offset, offset + limit), total: found.length }
  })

/**
 * POST /projects/:projectId/requirements · PUT /requirements/:id
 * When the meaning of an existing requirement changes, the server flags its linked cases for review.
 */
export const saveRequirement = (fields: RequirementInput) =>
  respond<RequirementChangeResult>(() => {
    assertCan('requirement.edit', fields.projectId)
    // a TOR requirement names its clause; an additional one has none
    const torClause = fields.origin === 'tor' ? fields.torClause?.trim() : undefined
    if (fields.origin === 'tor' && !torClause) throw new ApiError('กรุณาระบุข้อใน TOR', 400)
    const input: RequirementInput = { ...fields, torClause }
    const list = requirements()
    const now = new Date().toISOString()
    if (list.some((r) => r.projectId === input.projectId && r.code === input.code && r.id !== input.id)) {
      throw new ApiError(`รหัส ${input.code} มีอยู่แล้ว`, 409)
    }
    if (input.id) {
      const i = list.findIndex((r) => r.id === input.id)
      if (i < 0) throw new ApiError('ไม่พบ Requirement', 404)
      const before = list[i]
      list[i] = { ...before, ...input, id: input.id, updatedAt: now }
      save(STORAGE_KEYS.requirements, list)
      const changed = meaningChanges(before, list[i])
      const flaggedCases = changed.length ? flagCasesForReview(list[i], `${list[i].code} แก้ไข: ${changed.join(', ')}`) : []
      return { requirement: list[i], flaggedCases }
    }
    const created: Requirement = { ...input, id: newId('req'), createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.requirements, [...list, created])
    return { requirement: created, flaggedCases: [] }
  })

/**
 * POST /projects/:projectId/requirements/import  { requirements, updateExisting }
 * Rows without a code get the next free one; a code that exists is skipped, or updated when
 * `updateExisting` (then a change to what it says flags its cases, as an edit does).
 */
export const importRequirements = (projectId: string, rows: RequirementImportRow[], updateExisting: boolean) =>
  respond<RequirementImportResult>(() => {
    assertCan('requirement.edit', projectId)
    const project = storedProjects().find((p) => p.id === projectId)
    if (!project) throw new ApiError('ไม่พบโปรเจกต์', 404)
    const codes = rows.map((r) => r.code?.trim()).filter((c): c is string => !!c)
    const twice = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))]
    if (twice.length) throw new ApiError(`รหัสซ้ำในไฟล์: ${twice.join(', ')}`, 422)
    if (rows.some((r) => r.origin === 'tor' && !r.torClause?.trim())) throw new ApiError('Requirement ตาม TOR ต้องระบุข้อใน TOR', 400)

    const list = requirements()
    const now = new Date().toISOString()
    const result: RequirementImportResult = { created: [], updated: [], skipped: [], flaggedCases: [] }
    const used = list.filter((r) => r.projectId === projectId).map((r) => r.code)
    for (const row of rows) {
      const fields = { ...row, torClause: row.origin === 'tor' ? row.torClause?.trim() : undefined }
      const existing = row.code ? list.find((r) => r.projectId === projectId && r.code === row.code!.trim()) : undefined
      if (existing && !updateExisting) result.skipped.push(existing.code)
      else if (existing) {
        const updated: Requirement = { ...existing, ...fields, code: existing.code, updatedAt: now }
        list[list.indexOf(existing)] = updated
        const changed = meaningChanges(existing, updated)
        if (changed.length) result.flaggedCases.push(...flagCasesForReview(updated, `${updated.code} แก้ไขจากการนำเข้า: ${changed.join(', ')}`))
        result.updated.push(updated)
      } else {
        const code = row.code?.trim() || nextRequirementCode(project.key, used)
        used.push(code)
        const created: Requirement = { ...fields, code, projectId, id: newId('req'), createdAt: now, updatedAt: now }
        list.push(created)
        result.created.push(created)
      }
    }
    save(STORAGE_KEYS.requirements, list)
    // a case linked to several updated requirements is flagged once (its latest state)
    result.flaggedCases = [...new Map(result.flaggedCases.map((c: TestCase) => [c.id, c])).values()]
    return result
  }, 600)

/** DELETE /requirements/:id (its linked cases are flagged for review: they lost what they test) */
export const deleteRequirement = (id: string) =>
  respond<RequirementChangeResult>(() => {
    const list = requirements()
    const target = list.find((r) => r.id === id)
    if (!target) throw new ApiError('ไม่พบ Requirement', 404)
    assertCan('requirement.delete', target.projectId)
    save(
      STORAGE_KEYS.requirements,
      list.filter((r) => r.id !== id),
    )
    return { flaggedCases: flagCasesForReview(target, `${target.code} ถูกลบ`) }
  })
