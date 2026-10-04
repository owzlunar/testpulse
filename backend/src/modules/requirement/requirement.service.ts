import { meaningChanges, nextRequirementCode } from '#contract/rules/requirement.js'
import type {
  Requirement,
  RequirementChangeResult,
  RequirementImportResult,
  RequirementImportRow,
  RequirementInput,
  TestCase,
} from '#contract/types.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import { can, type Principal } from '#core/auth/principal.js'
import { assertCan } from '#core/auth/guards.js'
import { emit } from '#core/events/event-bus.js'
import { ApiError } from '#core/http/errors.js'
import { searchPattern } from '#core/http/search.js'
import { notify } from '#core/notify/notify-sink.js'
import { projectAccess } from '#modules/project/index.js'
import { accounts } from '#modules/user/index.js'
import { requirementRepository } from './requirement.repository.js'

declare module '#core/events/event-bus.js' {
  interface DomainEvents {
    /** what a requirement says changed: handlers flag the cases that test it and return them */
    'requirement.changed': { requirement: Requirement; reason: string }
    /** a requirement was deleted: handlers flag the cases that tested it and return them */
    'requirement.deleted': { requirement: Requirement; reason: string }
  }
}

export type RequirementFields = Omit<RequirementInput, 'id' | 'projectId'>

async function assertCodeFree(projectId: string, code: string, exceptId?: string) {
  const other = await requirementRepository.findOne({ projectId, code })
  if (other && other.id !== exceptId) throw ApiError.conflict(`รหัส ${code} มีอยู่แล้ว`, 'duplicate')
}

async function found(id: string): Promise<Requirement> {
  const requirement = await requirementRepository.findById(id)
  if (!requirement) throw ApiError.notFound('ไม่พบ Requirement')
  return requirement
}

async function guard(p: Principal, projectId: string, need: 'requirement.edit' | 'requirement.delete') {
  assertCan(p, need)
  return projectAccess.assert(p, projectId)
}

/** a word to the QA who test the flagged cases (every QA when none is assigned) */
async function tellQa(projectId: string, flagged: TestCase[], title: string) {
  if (!flagged.length) return
  const qa = await accounts.idsByName([...new Set(flagged.map((c) => c.assignedTo).filter((n): n is string => !!n))])
  await notify({
    type: 'MODIFIED',
    title,
    message: `Test Case ${flagged.length} รายการต้องทบทวน: ${flagged.map((c) => c.id).join(', ')}`,
    projectId,
    to: qa.length ? { userIds: qa } : { disciplines: ['qa'] },
    severity: 'warning',
  })
}

/** the cases the change flagged for review, and a word to the QA who test them */
async function flagCases(event: 'requirement.changed' | 'requirement.deleted', requirement: Requirement, reason: string, what: string) {
  const flagged = (await emit(event, { requirement, reason })).flat() as TestCase[]
  await tellQa(requirement.projectId, flagged, `Requirement ${requirement.code} ${what}`)
  return flagged
}

const audit = (action: 'CREATE' | 'UPDATE' | 'DELETE', r: Requirement, details: string) =>
  recordAudit({ action, targetType: 'PROJECT', targetId: r.code, projectId: r.projectId, targetTitle: r.title, details })

export const requirementService = {
  /** GET /requirements: of the projects the user may open */
  async list(p: Principal): Promise<Requirement[]> {
    if (!p.roleId || !can(p, 'requirement.view')) return []
    return requirementRepository.ofProjects([...(await projectAccess.accessibleIds(p))])
  },

  /** GET /requirements/search: code, TOR clause, title or description contains the text */
  async search(p: Principal, q: string, limit: number, offset = 0): Promise<{ requirements: Requirement[]; total: number }> {
    const text = q.trim()
    if (!text || !p.roleId || !can(p, 'requirement.view')) return { requirements: [], total: 0 }
    const pattern = searchPattern(text)
    const projectIds = [...(await projectAccess.accessibleIds(p))]
    const { items, total } = await requirementRepository.findPage(
      { projectId: { $in: projectIds }, $or: [{ code: pattern }, { torClause: pattern }, { title: pattern }, { description: pattern }] },
      { projectId: 1, code: 1 },
      limit,
      offset,
    )
    return { requirements: items, total }
  },

  /** ids of the projects' requirements whose "CODE: title" (as a case shows it) has the text, in one query */
  idsMatching: (projectIds: string[], text: string): Promise<string[]> => requirementRepository.idsMatching(projectIds, text),

  /** a project's requirements (other modules: links, coverage) */
  ofProject: (projectId: string) => requirementRepository.ofProject(projectId),

  async create(p: Principal, projectId: string, fields: RequirementFields): Promise<RequirementChangeResult> {
    await guard(p, projectId, 'requirement.edit')
    await assertCodeFree(projectId, fields.code)
    const requirement = await requirementRepository.create({ ...fields, projectId })
    await audit('CREATE', requirement, `เพิ่ม Requirement ${requirement.code}`)
    return { requirement, flaggedCases: [] }
  },

  async update(p: Principal, id: string, fields: RequirementFields): Promise<RequirementChangeResult> {
    const before = await found(id)
    await guard(p, before.projectId, 'requirement.edit')
    await assertCodeFree(before.projectId, fields.code, id)
    const requirement = (await requirementRepository.update(id, { ...fields, torClause: fields.torClause }))!
    const changed = meaningChanges(before, requirement)
    const flaggedCases = changed.length
      ? await flagCases('requirement.changed', requirement, `${requirement.code} แก้ไข: ${changed.join(', ')}`, 'ถูกแก้ไข')
      : []
    await audit('UPDATE', requirement, `แก้ไข Requirement ${requirement.code}`)
    return { requirement, flaggedCases }
  },

  /**
   * POST /projects/:projectId/requirements/import: rows without a code get the next free one; a code
   * that exists is skipped, or updated when asked (a change to what it says flags its cases). One audit
   * entry and one word to QA for the whole import.
   */
  async importMany(p: Principal, projectId: string, rows: RequirementImportRow[], updateExisting: boolean): Promise<RequirementImportResult> {
    const project = await guard(p, projectId, 'requirement.edit')
    const codes = rows.map((r) => r.code?.trim()).filter((c): c is string => !!c)
    const twice = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))]
    if (twice.length) throw ApiError.unprocessable(`รหัสซ้ำในไฟล์: ${twice.join(', ')}`)

    const existing = new Map((await requirementRepository.ofProject(projectId)).map((r) => [r.code, r]))
    const used = [...existing.keys()]
    const result: RequirementImportResult = { created: [], updated: [], skipped: [], flaggedCases: [] }
    for (const { code: given, ...fields } of rows) {
      const before = given ? existing.get(given.trim()) : undefined
      if (before && !updateExisting) {
        result.skipped.push(before.code)
      } else if (before) {
        const requirement = (await requirementRepository.update(before.id, { ...fields, torClause: fields.torClause }))!
        const changed = meaningChanges(before, requirement)
        if (changed.length) {
          const reason = `${requirement.code} แก้ไขจากการนำเข้า: ${changed.join(', ')}`
          result.flaggedCases.push(...((await emit('requirement.changed', { requirement, reason })).flat() as TestCase[]))
        }
        result.updated.push(requirement)
      } else {
        const code = given?.trim() || nextRequirementCode(project.key, used)
        used.push(code)
        result.created.push(await requirementRepository.create({ ...fields, code, projectId }))
      }
    }
    // a case linked to several updated requirements is flagged once (its latest state)
    result.flaggedCases = [...new Map(result.flaggedCases.map((c) => [c.id, c])).values()]
    await tellQa(projectId, result.flaggedCases, `Requirement ${result.updated.length} รายการถูกแก้ไขจากการนำเข้า`)
    await recordAudit({
      action: 'CREATE',
      targetType: 'PROJECT',
      targetId: project.key,
      projectId,
      targetTitle: 'นำเข้า Requirement',
      details: `นำเข้า Requirement: เพิ่ม ${result.created.length} แก้ไข ${result.updated.length} ข้าม ${result.skipped.length}`,
    })
    return result
  },

  async remove(p: Principal, id: string): Promise<RequirementChangeResult> {
    const target = await found(id)
    await guard(p, target.projectId, 'requirement.delete')
    await requirementRepository.remove(id)
    const flaggedCases = await flagCases('requirement.deleted', target, `${target.code} ถูกลบ`, 'ถูกลบ')
    await audit('DELETE', target, `ลบ Requirement ${target.code}`)
    return { flaggedCases }
  },

  /** requirements stored before they had an origin were added on top of the TOR (migration) */
  backfillOrigin: () => requirementRepository.markOriginless(),

  removeOfProject: async (projectId: string) => {
    await requirementRepository.deleteOfProject(projectId)
  },
}
