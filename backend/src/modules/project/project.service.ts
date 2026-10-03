import type { ClientSession } from 'mongoose'
import type { Project, ProjectInput, ProjectStats, TestCaseStatus } from '#contract/types.js'
import type { Principal } from '#core/auth/principal.js'
import { emit } from '#core/events/event-bus.js'
import { ApiError } from '#core/http/errors.js'
import { notify } from '#core/notify/notify-sink.js'
import { teams } from '#modules/team/index.js'
import { projectRepository } from './project.repository.js'

declare module '#core/events/event-bus.js' {
  interface DomainEvents {
    /** a project was deleted: modules remove what belonged to it */
    'project.deleted': { projectId: string }
  }
}

export type ProjectFields = Omit<ProjectInput, 'id' | 'caseStats'>

// --- case counts --------------------------------------------------------------------------------
// The test-case module provides the counts (cases load one project at a time in the web app, so
// project lists carry them). Until a provider is registered every project counts zero.

export type CaseStatsProvider = (projectIds: string[]) => Promise<Map<string, ProjectStats>>

const STATUSES: TestCaseStatus[] = ['pending', 'ready_for_test', 'untested', 'in_progress', 'passed', 'failed', 'blocked']
export const emptyStats = (): ProjectStats => ({
  total: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  inProgress: 0,
  untested: 0,
  passRate: 0,
  byStatus: Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<TestCaseStatus, number>,
  attention: 0,
})

let caseStatsProvider: CaseStatsProvider | null = null
export const setCaseStatsProvider = (provider: CaseStatsProvider | null) => {
  caseStatsProvider = provider
}

async function withStats(projects: Project[]): Promise<Project[]> {
  const stats = caseStatsProvider ? await caseStatsProvider(projects.map((p) => p.id)) : new Map<string, ProjectStats>()
  return projects.map((p) => ({ ...p, caseStats: stats.get(p.id) ?? emptyStats() }))
}

// --- access -------------------------------------------------------------------------------------

/** Admins open every project; otherwise a role is needed, and a project with teams is open only to their members */
async function canAccess(principal: Principal, project: Pick<Project, 'teamIds'>, memberOf?: string[]): Promise<boolean> {
  if (principal.isAdmin) return true
  if (!principal.roleId) return false
  if (!project.teamIds?.length) return true
  const mine = memberOf ?? (await teams.idsOfMember(principal.id))
  return project.teamIds.some((id) => mine.includes(id))
}

async function accessible(principal: Principal): Promise<Project[]> {
  if (!principal.roleId) return []
  const all = await projectRepository.find()
  if (principal.isAdmin) return all
  const memberOf = await teams.idsOfMember(principal.id)
  const allowed: Project[] = []
  for (const p of all) if (await canAccess(principal, p, memberOf)) allowed.push(p)
  return allowed
}

async function assertKeyFree(key: string, exceptId?: string) {
  const other = await projectRepository.findByKey(key)
  if (other && other.id !== exceptId) throw ApiError.conflict(`มีโปรเจกต์รหัส ${key.toUpperCase()} อยู่แล้ว`, 'duplicate')
}

export const projectService = {
  /** GET /projects: the ones the user may open, with case counts */
  list: async (principal: Principal): Promise<Project[]> => withStats(await accessible(principal)),

  async create(fields: ProjectFields): Promise<Project> {
    await assertKeyFree(fields.key)
    const [project] = await withStats([await projectRepository.create(fields)])
    // everyone who can open it, but the Admin who made it
    await notify({
      type: 'MODIFIED',
      title: 'สร้างโปรเจกต์ใหม่',
      message: `โปรเจกต์ "${project!.name}" ถูกสร้างแล้ว`,
      projectId: project!.id,
      severity: 'info',
    })
    return project!
  },

  async update(id: string, fields: ProjectFields): Promise<Project> {
    if (!(await projectRepository.exists({ _id: id }))) throw ApiError.notFound('ไม่พบโปรเจกต์')
    await assertKeyFree(fields.key, id)
    const [project] = await withStats([(await projectRepository.updateById(id, fields))!])
    return project!
  },

  async remove(id: string): Promise<void> {
    if (!(await projectRepository.deleteById(id))) throw ApiError.notFound('ไม่พบโปรเจกต์')
    await emit('project.deleted', { projectId: id })
  },

  /** a deleted team leaves its projects (one update each, so each is audited); returns the changed projects */
  async dropTeam(teamId: string, session: ClientSession): Promise<Project[]> {
    const changed: Project[] = []
    for (const p of await projectRepository.withTeam(teamId, session)) {
      changed.push((await projectRepository.updateById(p.id, { teamIds: (p.teamIds ?? []).filter((t) => t !== teamId) }, session))!)
    }
    return changed
  },

  /** 403 unless the user may open the project (404 when it doesn't exist) */
  async assertAccess(principal: Principal, projectId: string): Promise<Project> {
    const project = await projectRepository.findById(projectId)
    if (!project) throw ApiError.notFound('ไม่พบโปรเจกต์')
    if (!(await canAccess(principal, project))) throw ApiError.forbidden('คุณไม่ได้อยู่ในทีมของโปรเจกต์นี้')
    return project
  },

  /** ids of the projects the user may open (list endpoints of other modules filter by it) */
  accessibleIds: async (principal: Principal): Promise<Set<string>> => new Set((await accessible(principal)).map((p) => p.id)),
}
