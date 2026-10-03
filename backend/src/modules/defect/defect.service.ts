import type { Defect, DefectInput, PermissionKey, TestCaseImpact } from '#contract/types.js'
import { isOpenDefect } from '#contract/rules/defect.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import { assertCan } from '#core/auth/guards.js'
import { can, type Principal } from '#core/auth/principal.js'
import { ApiError } from '#core/http/errors.js'
import { searchPattern } from '#core/http/search.js'
import { notify } from '#core/notify/notify-sink.js'
import { projectAccess } from '#modules/project/index.js'
import { testCases } from '#modules/test-case/index.js'
import { accounts } from '#modules/user/index.js'
import { defectRepository } from './defect.repository.js'

export type DefectFields = Omit<DefectInput, 'id' | 'projectId' | 'caseDeleted'>

/** closing / rejecting is a verdict (defect.resolve); reporting and progress updates are defect.report */
const permissionFor = (status: Defect['status'], before?: Defect): PermissionKey =>
  !isOpenDefect({ status }) && status !== before?.status ? 'defect.resolve' : 'defect.report'

async function found(id: string): Promise<Defect> {
  const defect = await defectRepository.findById(id)
  if (!defect) throw ApiError.notFound('ไม่พบ Defect')
  return defect
}

async function guard(p: Principal, projectId: string, need: PermissionKey) {
  assertCan(p, need)
  await projectAccess.assert(p, projectId)
}

/** a linked case must be one of the project's (a deleted case's id stays only as history) */
async function assertCase(projectId: string, caseId?: string) {
  if (caseId && !(await testCases.find(projectId, caseId))) throw ApiError.unprocessable(`ไม่พบ ${caseId} ในโปรเจกต์นี้`)
}

/** the developer it is assigned to, or every developer when unassigned */
async function assigneeOf(name?: string) {
  const ids = await accounts.idsByName(name ? [name] : [])
  return ids.length ? { userIds: ids } : { disciplines: ['dev' as const] }
}

const defectAudit = (d: Defect, action: 'CREATE' | 'UPDATE', details: string) =>
  recordAudit({ action, targetType: 'TEST_CASE', targetId: d.id, projectId: d.projectId, targetTitle: d.title, details })

export const defectService = {
  /** GET /defects: of the projects the user may open, newest first */
  async list(p: Principal): Promise<Defect[]> {
    if (!p.roleId || !can(p, 'defect.view')) return []
    return defectRepository.ofProjects([...(await projectAccess.accessibleIds(p))])
  },

  /** GET /defects/search: id, title, external key or case, in the projects the user may open; newest first */
  async search(p: Principal, q: string, limit: number, offset: number): Promise<{ defects: Defect[]; total: number }> {
    const text = q.trim()
    if (!text || !p.roleId || !can(p, 'defect.view')) return { defects: [], total: 0 }
    const pattern = searchPattern(text)
    const { items, total } = await defectRepository.findPage(
      {
        projectId: { $in: [...(await projectAccess.accessibleIds(p))] },
        $or: [{ _id: pattern }, { title: pattern }, { externalKey: pattern }, { caseId: pattern }],
      },
      { createdAt: -1 },
      limit,
      offset,
    )
    return { defects: items, total }
  },

  /** POST /projects/:projectId/defects: numbered BUG-nnn; the assigned developer (or every one) is told */
  async create(p: Principal, projectId: string, fields: DefectFields): Promise<Defect> {
    await guard(p, projectId, permissionFor(fields.status))
    await assertCase(projectId, fields.caseId)
    const defect = await defectRepository.create({ ...fields, _id: await defectRepository.nextId(), projectId, reportedBy: p.name, comments: [] })
    await defectAudit(defect, 'CREATE', `รายงาน ${defect.id} (${defect.severity}) จาก ${defect.caseId ?? '-'}`)
    await notify({
      type: 'STATUS_CHANGED',
      title: `Defect ใหม่ ${defect.id}`,
      message: `${defect.title} · มอบหมาย ${defect.assignee || 'ทีม Dev'}`,
      projectId,
      testCaseId: defect.caseId,
      to: await assigneeOf(defect.assignee),
      severity: defect.severity === 'critical' || defect.severity === 'major' ? 'error' : 'warning',
    })
    return defect
  },

  /** PUT /defects/:id: picking another case re-attaches a defect whose case was deleted */
  async update(p: Principal, id: string, fields: DefectFields): Promise<Defect> {
    const before = await found(id)
    await guard(p, before.projectId, permissionFor(fields.status, before))
    const sameCase = fields.caseId === before.caseId
    if (!sameCase) await assertCase(before.projectId, fields.caseId)
    const saved = (await defectRepository.update(id, { ...fields, caseDeleted: sameCase ? before.caseDeleted : false }))!
    await defectAudit(saved, 'UPDATE', `แก้ไข ${saved.id}`)
    return saved
  },

  /** POST /defects/:id/comments: by the signed-in user, now */
  async comment(p: Principal, id: string, text: string): Promise<Defect> {
    const defect = await found(id)
    await guard(p, defect.projectId, 'defect.report')
    return (await defectRepository.addComment(id, { by: p.name, at: new Date().toISOString(), text }))!
  },

  /** the open defects that archiving / deleting these cases touches */
  async impactOf(projectId: string, ids: string[]): Promise<Pick<TestCaseImpact, 'openDefects'>> {
    return { openDefects: (await defectRepository.openOfCases(projectId, ids)).map((d) => ({ id: d.id, title: d.title })) }
  },
}
