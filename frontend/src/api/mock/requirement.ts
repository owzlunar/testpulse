import type { Requirement, RequirementChangeResult, RequirementInput } from '@/types'
import { ApiError } from '@/api/errors'
import { newId } from '@/utils/ids'
import { respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan } from './project'
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

/** what a requirement says; a change here means the linked cases must be reviewed (type / priority / status don't) */
const MEANING_FIELDS: { field: 'title' | 'description' | 'acceptanceCriteria'; label: string }[] = [
  { field: 'title', label: 'ชื่อ' },
  { field: 'description', label: 'รายละเอียด' },
  { field: 'acceptanceCriteria', label: 'เกณฑ์การยอมรับ' },
]

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
      const changed = MEANING_FIELDS.filter((m) => JSON.stringify(before[m.field]) !== JSON.stringify(list[i][m.field])).map((m) => m.label)
      const flaggedCases = changed.length ? flagCasesForReview(list[i], `${list[i].code} แก้ไข: ${changed.join(', ')}`) : []
      return { requirement: list[i], flaggedCases }
    }
    const created: Requirement = { ...input, id: newId('req'), createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.requirements, [...list, created])
    return { requirement: created, flaggedCases: [] }
  })

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
