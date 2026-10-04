import type { PermissionKey, Project, ProjectInput, ProjectStats, User } from '@/types'
import { ApiError } from '@/api/errors'
import { PROJECT_KEY_MAX, PROJECT_KEY_MIN, caseStatsOf, defaultEnvironments, environmentsProblem, isProjectKey } from '@/domain/project'
import { permissionOf } from '@/domain/role'
import { newId } from '@/utils/ids'
import { respond } from './http'
import { roleById } from './role'
import { SEED_PROJECTS } from './seeds/projects.seed'
import { STORAGE_KEYS, load, migrateOnce, save } from './storage'
import { teams } from './team'
import { storedCases } from './test-case'
import { sessionUser } from './user'

// --- API ------------------------------------------------------------------------
/** re-applies demo fields that older saved data may be missing */
/** server-side: every stored project (seeds the demo data on first use) */
export const storedProjects = (): Project[] => projects()

function projects(): Project[] {
  // stored before projects had environments: they were tested on one, TEST
  migrateOnce('project-environments-v1', () => {
    const stored = load(STORAGE_KEYS.projects, SEED_PROJECTS)
    save(
      STORAGE_KEYS.projects,
      stored.map((p) =>
        p.environments?.length ? p : { ...p, environments: SEED_PROJECTS.find((s) => s.id === p.id)?.environments ?? defaultEnvironments() },
      ),
    )
  })
  const list = load(STORAGE_KEYS.projects, SEED_PROJECTS)
  const seed = SEED_PROJECTS[0]
  const demo = list.find((p) => p.id === seed.id)
  if (demo && (demo.logo !== seed.logo || !demo.milestones?.length)) {
    demo.logo = seed.logo
    demo.milestones = demo.milestones?.length ? demo.milestones : seed.milestones
    save(STORAGE_KEYS.projects, list)
  }
  return list
}

/**
 * server-side: may this user open the project? Admins always; otherwise the user needs a role, and
 * a project with teams is open only to their members (a project without teams is open to every role).
 */
export function canAccessProject(user: User | null, project: Pick<Project, 'teamIds' | 'environments'>): boolean {
  const role = roleById(user?.roleId)
  if (!user || !role) return false
  if (role.builtIn === 'admin' || !project.teamIds?.length) return true
  // the teams of the project, and the teams that run its environments (e.g. the ops team of STAGING)
  const allowed = [...project.teamIds, ...(project.environments ?? []).map((e) => e.teamId).filter((t): t is string => !!t)]
  return teams().some((t) => allowed.includes(t.id) && t.memberIds.includes(user.id))
}

/** server-side: ids of the projects the signed-in user may open (every list endpoint filters by it) */
export function accessibleProjectIds(): Set<string> {
  const user = sessionUser()
  return new Set(
    projects()
      .filter((p) => canAccessProject(user, p))
      .map((p) => p.id),
  )
}

/**
 * server-side: refuse a request the signed-in user may not make (403), as the real backend must:
 * hiding buttons is not security. `need` is a permission, any of several, or 'admin' (built-in Admin
 * only); with a projectId the user must also be allowed to open that project (team access).
 */
export function assertCan(need: PermissionKey | PermissionKey[] | 'admin', projectId?: string): void {
  const user = sessionUser()
  const role = roleById(user?.roleId)
  if (!user || !role) throw new ApiError('บัญชีนี้ยังไม่มี Role ติดต่อ Admin', 403)
  const isAdmin = role.builtIn === 'admin'
  if (need === 'admin') {
    if (!isAdmin) throw new ApiError('เฉพาะ Admin เท่านั้น', 403)
  } else {
    const keys = Array.isArray(need) ? need : [need]
    if (!isAdmin && !keys.some((k) => role.permissions.includes(k))) {
      throw new ApiError(`Role ${role.name} ไม่มีสิทธิ์ "${keys.map((k) => permissionOf(k)?.label ?? k).join(' หรือ ')}"`, 403)
    }
  }
  if (projectId) {
    const project = projects().find((p) => p.id === projectId)
    if (project && !canAccessProject(user, project)) throw new ApiError('คุณไม่ได้อยู่ในทีมของโปรเจกต์นี้', 403)
  }
}

/** server-side: does the signed-in user's role have this permission? (the built-in Admin has all) */
export function sessionCan(key: PermissionKey): boolean {
  const role = roleById(sessionUser()?.roleId)
  return !!role && (role.builtIn === 'admin' || role.permissions.includes(key))
}

/** server-side: keep the records that belong to projects the signed-in user may open (no project = global) */
export function inAccessibleProjects<T extends { projectId?: string }>(list: T[]): T[] {
  const ids = accessibleProjectIds()
  return list.filter((x) => !x.projectId || ids.has(x.projectId))
}

/**
 * GET /projects (only the ones the signed-in user may open), each with the counts of its active cases:
 * the client loads cases one project at a time, so lists and totals come from here
 */
export const fetchProjects = () =>
  respond(() => {
    const user = sessionUser()
    const cases = storedCases().filter((c) => !c.archivedAt)
    return projects()
      .filter((p) => canAccessProject(user, p))
      .map((p) => ({ ...p, caseStats: caseStatsOf(cases.filter((c) => c.projectId === p.id)) }))
  })

/** server-side: what a client sends never sets computed fields */
const withoutComputed = ({ caseStats: _stats, ...input }: ProjectInput & { caseStats?: ProjectStats }) => input

/** server-side: a new project starts with TEST; names given and different, exactly one primary */
function withEnvironments(input: ProjectInput): ProjectInput {
  const environments = (input.environments?.length ? input.environments : defaultEnvironments()).map((e) => ({
    ...e,
    name: e.name.trim(),
    teamId: e.teamId || undefined,
  }))
  const problem = environmentsProblem(environments)
  if (problem) throw new ApiError(problem, 422)
  return { ...input, environments }
}

/** server-side: the key's shape (the backend's validation answers 400 too) */
function assertKey(key: string) {
  if (!isProjectKey(key)) throw new ApiError(`Project Key ต้องเป็นตัวพิมพ์ใหญ่ A-Z หรือตัวเลข ${PROJECT_KEY_MIN}–${PROJECT_KEY_MAX} ตัว`, 400)
}

/** POST /projects (Admin only) */
export const createProject = (input: ProjectInput) =>
  respond(() => {
    assertCan('admin')
    assertKey(input.key)
    const now = new Date().toISOString()
    const project: Project = { ...withoutComputed(withEnvironments(input)), id: newId('proj'), createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.projects, [project, ...projects()])
    return project
  })

/** PUT /projects/:id (Admin only) */
export const updateProject = (id: string, input: ProjectInput) =>
  respond(() => {
    assertCan('admin')
    assertKey(input.key)
    const list = projects()
    const i = list.findIndex((p) => p.id === id)
    if (i < 0) throw new ApiError('ไม่พบโปรเจกต์', 404)
    list[i] = { ...list[i], ...withoutComputed(withEnvironments(input)), id, updatedAt: new Date().toISOString() }
    save(STORAGE_KEYS.projects, list)
    return list[i]
  })

/** DELETE /projects/:id (the server also removes the project's test cases) */
export const deleteProject = (id: string) =>
  respond(() => {
    assertCan('admin')
    save(
      STORAGE_KEYS.projects,
      projects().filter((p) => p.id !== id),
    )
    save(
      STORAGE_KEYS.testCases,
      storedCases().filter((c) => c.projectId !== id),
    )
  })
