import type { Defect, DefectInput, NotificationAudience, PermissionKey, Project, TestCaseImpact } from '#contract/types.js'
import { isOpenDefect } from '#contract/rules/defect.js'
import { environmentOf } from '#contract/rules/project.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import { assertCan } from '#core/auth/guards.js'
import { can, type Principal } from '#core/auth/principal.js'
import { ApiError } from '#core/http/errors.js'
import { searchPattern } from '#core/http/search.js'
import { notify } from '#core/notify/notify-sink.js'
import { projectAccess } from '#modules/project/index.js'
import { teams } from '#modules/team/index.js'
import { testCases } from '#modules/test-case/index.js'
import { accounts } from '#modules/user/index.js'
import { defectRepository } from './defect.repository.js'

export type DefectFields = Omit<DefectInput, 'id' | 'projectId' | 'caseDeleted' | 'environment'>

/** closing / rejecting is a verdict (defect.resolve); reporting and progress updates are defect.report */
const permissionFor = (status: Defect['status'], before?: Defect): PermissionKey =>
  !isOpenDefect({ status }) && status !== before?.status ? 'defect.resolve' : 'defect.report'

async function found(id: string): Promise<Defect> {
  const defect = await defectRepository.findById(id)
  if (!defect) throw ApiError.notFound('ไม่พบ Defect')
  return defect
}

async function guard(p: Principal, projectId: string, need: PermissionKey): Promise<Project> {
  assertCan(p, need)
  return projectAccess.assert(p, projectId)
}

/** the environment it was found on is one of the project's; the server names it (older defects keep their free text) */
function placed(project: Project, fields: DefectFields, before?: Defect): Pick<Defect, 'environmentId' | 'environment'> {
  if (!fields.environmentId) return { environmentId: undefined, environment: before?.environment }
  const env = environmentOf(project, fields.environmentId)
  if (!env) throw ApiError.unprocessable('ไม่พบ Environment นี้ในโปรเจกต์')
  return { environmentId: env.id, environment: env.name }
}

/** a linked case must be one of the project's (a deleted case's id stays only as history) */
async function assertCase(projectId: string, caseId?: string) {
  if (caseId && !(await testCases.find(projectId, caseId))) throw ApiError.unprocessable(`ไม่พบ ${caseId} ในโปรเจกต์นี้`)
}

/**
 * who works on it: the assignee, else every developer (code) or the team running the environment it was
 * found on, else everyone in ops (server problems)
 */
async function assigneeOf(d: Defect, project: Project): Promise<NotificationAudience> {
  const ids = await accounts.idsByName(d.assignee ? [d.assignee] : [])
  if (ids.length) return { userIds: ids }
  if (d.cause !== 'environment') return { disciplines: ['dev'] }
  const teamId = environmentOf(project, d.environmentId)?.teamId
  const members = teamId ? await teams.memberIds(teamId) : []
  return members.length ? { userIds: members } : { disciplines: ['ops'] }
}

/** the QA who reported it, else every QA */
async function reporterOf(d: Defect): Promise<NotificationAudience> {
  const ids = await accounts.idsByName([d.reportedBy])
  return ids.length ? { userIds: ids } : { disciplines: ['qa'] }
}

const sideOf = (d: Defect) => (d.cause === 'environment' ? `ทีม Server${d.environment ? ` (${d.environment})` : ''}` : 'ทีม Dev')

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
    const project = await guard(p, projectId, permissionFor(fields.status))
    await assertCase(projectId, fields.caseId)
    const defect = await defectRepository.create({
      ...fields,
      ...placed(project, fields),
      fixedAt: fields.status === 'fixed' ? new Date().toISOString() : undefined,
      _id: await defectRepository.nextId(),
      projectId,
      reportedBy: p.name,
      comments: [],
    })
    await defectAudit(defect, 'CREATE', `รายงาน ${defect.id} (${defect.severity}) จาก ${defect.caseId ?? '-'}`)
    await notify({
      type: 'STATUS_CHANGED',
      title: `Defect ใหม่ ${defect.id}`,
      message: `${defect.title} · มอบหมาย ${defect.assignee || sideOf(defect)}`,
      projectId,
      testCaseId: defect.caseId,
      to: await assigneeOf(defect, project),
      severity: defect.severity === 'critical' || defect.severity === 'major' ? 'error' : 'warning',
    })
    return defect
  },

  /**
   * PUT /defects/:id: picking another case re-attaches a defect whose case was deleted. A changed cause
   * hands it to the other side (Dev or the server's team); a server problem marked fixed goes back to
   * the QA who reported it to re-test on that environment.
   */
  async update(p: Principal, id: string, fields: DefectFields): Promise<Defect> {
    const before = await found(id)
    const project = await guard(p, before.projectId, permissionFor(fields.status, before))
    const sameCase = fields.caseId === before.caseId
    if (!sameCase) await assertCase(before.projectId, fields.caseId)
    const saved = (await defectRepository.update(id, {
      ...fields,
      ...placed(project, fields, before),
      caseDeleted: sameCase ? before.caseDeleted : false,
      // time to fix: when it was first marked fixed
      fixedAt: before.fixedAt ?? (fields.status === 'fixed' ? new Date().toISOString() : undefined),
    }))!
    await defectAudit(saved, 'UPDATE', `แก้ไข ${saved.id}`)
    if (saved.cause !== (before.cause ?? 'code')) {
      await notify({
        type: 'STATUS_CHANGED',
        title: `${saved.id} ส่งต่อให้${sideOf(saved)}`,
        message: `${saved.title} · สาเหตุ: ${saved.cause === 'environment' ? 'Server / Environment' : 'โค้ด'}`,
        projectId: saved.projectId,
        testCaseId: saved.caseId,
        to: await assigneeOf(saved, project),
        severity: 'warning',
      })
    } else if (saved.cause === 'environment' && saved.status === 'fixed' && before.status !== 'fixed') {
      await notify({
        type: 'STATUS_CHANGED',
        title: `${saved.id} แก้ไขแล้ว รอทดสอบซ้ำ${saved.environment ? `บน ${saved.environment}` : ''}`,
        message: saved.title,
        projectId: saved.projectId,
        testCaseId: saved.caseId,
        to: await reporterOf(saved),
        severity: 'info',
      })
    }
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
