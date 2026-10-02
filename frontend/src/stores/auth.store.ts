import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Option, PermissionKey, Project, Role, RoleDiscipline, RoleInput, Team, TeamInput, User } from '@/types'
import * as api from '@/services/user.service'
import * as roleApi from '@/services/role.service'
import * as teamApi from '@/services/team.service'
import { NO_ROLE } from '@/services/role.service'
import { useAuditStore } from './audit.store'

// Session (mock login / user switching), users, their role groups and teams
export const useAuthStore = defineStore('auth', () => {
  const users = ref<User[]>([])
  const roles = ref<Role[]>([])
  const teams = ref<Team[]>([])
  const currentUser = ref<User>(api.MOCK_USERS[0])

  const roleById = (id: string | null | undefined) => (id ? (roles.value.find((r) => r.id === id) ?? null) : null)
  /** null: a new user without a role (sees only the dashboard and settings) */
  const currentRole = computed(() => roleById(currentUser.value.roleId))
  /** the built-in Admin role: every permission, and the only one that manages users, roles, teams and projects */
  const isAdmin = computed(() => currentRole.value?.builtIn === 'admin')
  const hasRole = computed(() => !!currentRole.value)

  async function load() {
    const [list, roleList, teamList, session] = await Promise.all([api.fetchUsers(), roleApi.fetchRoles(), teamApi.fetchTeams(), api.fetchSession()])
    users.value = list
    roles.value = roleList
    teams.value = teamList
    currentUser.value = list.find((u) => u.id === session.id) ?? list[0] ?? session
  }

  function can(key: PermissionKey): boolean {
    return isAdmin.value || !!currentRole.value?.permissions.includes(key)
  }

  /** how a user's role is shown (chip label, tone, icon) */
  function roleOf(user: Pick<User, 'roleId'>): Option {
    const role = roleById(user.roleId)
    return role ? { value: role.id, label: role.name, tone: role.tone, icon: role.icon, hint: role.description } : NO_ROLE
  }

  /** role pickers: "no role" first, then every role (value = role id, null = no role) */
  const roleOptions = computed(() => [
    { value: null as string | null, label: NO_ROLE.label, hint: NO_ROLE.hint, tone: NO_ROLE.tone, icon: NO_ROLE.icon },
    ...roles.value.map((r) => ({ value: r.id as string | null, label: r.name, hint: r.description, tone: r.tone, icon: r.icon })),
  ])

  /** people for the QA / Developer pickers and "my work" */
  const usersIn = (discipline: RoleDiscipline) => users.value.filter((u) => roleById(u.roleId)?.discipline === discipline)

  async function loginAs(user: User) {
    currentUser.value = await api.login(user.id)
  }

  /**
   * Sign in as someone else and start the app again at `to`: everything loaded so far (projects,
   * cases, runs …) was filtered for the previous user, so it is reloaded rather than reused.
   */
  async function switchUser(user: User, to?: string) {
    await loginAs(user)
    // an app path ('/dashboard') resolves against <base href>, so it works under a sub path too
    window.location.assign(to ? new URL(to.replace(/^\//, ''), document.baseURI).href : window.location.href)
  }

  /**
   * people who may open a project (same rule as the server's canAccessProject): Admins, plus the members
   * (with a role) of its teams, or everyone with a role when the project has no team
   */
  function membersOf(project: Pick<Project, 'teamIds'>): User[] {
    const teamIds = project.teamIds ?? []
    return users.value.filter((u) => {
      const role = roleById(u.roleId)
      if (!role) return false
      if (role.builtIn === 'admin' || !teamIds.length) return true
      return teams.value.some((t) => teamIds.includes(t.id) && t.memberIds.includes(u.id))
    })
  }

  /** user ids for names stored on records (cases keep the assigned QA / developer by name) */
  const userIdsByName = (...names: (string | undefined | null)[]) => users.value.filter((u) => names.includes(u.name)).map((u) => u.id)

  /** teams of a user (a user can be in several) */
  const teamsOf = (userId: string) => teams.value.filter((t) => t.memberIds.includes(userId))

  const audit = () => useAuditStore()

  async function updateUserRole(userId: string, roleId: string | null) {
    const before = users.value.find((u) => u.id === userId)
    const saved = await api.updateUser(userId, { roleId })
    users.value = users.value.map((u) => (u.id === userId ? saved : u))
    if (currentUser.value.id === userId) currentUser.value = saved
    audit().record({
      action: 'UPDATE',
      targetType: 'PROJECT',
      targetId: userId,
      targetTitle: saved.name,
      details: `เปลี่ยน Role ของ ${saved.name}: ${before ? roleOf(before).label : '-'} → ${roleOf(saved).label}`,
    })
  }

  async function addUser(input: Omit<User, 'id'>): Promise<User> {
    const user = await api.createUser(input)
    users.value.push(user)
    return user
  }

  async function saveRole(input: RoleInput): Promise<Role> {
    const saved = await roleApi.saveRole(input)
    const i = roles.value.findIndex((r) => r.id === saved.id)
    if (i >= 0) roles.value[i] = saved
    else roles.value.push(saved)
    audit().record({
      action: input.id ? 'UPDATE' : 'CREATE',
      targetType: 'PROJECT',
      targetId: saved.id,
      targetTitle: `Role ${saved.name}`,
      details: `${input.id ? 'แก้ไข' : 'สร้าง'} Role ${saved.name} (${saved.permissions.length} สิทธิ์)`,
    })
    return saved
  }

  /** delete a role; its users move to `moveTo` (or have no role) */
  async function deleteRole(id: string, moveTo: string | null) {
    const target = roleById(id)
    const moved = await roleApi.deleteRole(id, moveTo)
    roles.value = roles.value.filter((r) => r.id !== id)
    const movedIds = new Set(moved.map((u) => u.id))
    users.value = users.value.map((u) => (movedIds.has(u.id) ? { ...u, roleId: moveTo } : u))
    if (movedIds.has(currentUser.value.id)) currentUser.value = { ...currentUser.value, roleId: moveTo }
    audit().record({
      action: 'DELETE',
      targetType: 'PROJECT',
      targetId: id,
      targetTitle: `Role ${target?.name ?? id}`,
      details: `ลบ Role ${target?.name ?? id}${moved.length ? ` ย้ายผู้ใช้ ${moved.length} คนไป ${roleOf({ roleId: moveTo }).label}` : ''}`,
    })
  }

  async function saveTeam(input: TeamInput): Promise<Team> {
    const saved = await teamApi.saveTeam(input)
    const i = teams.value.findIndex((t) => t.id === saved.id)
    if (i >= 0) teams.value[i] = saved
    else teams.value.push(saved)
    audit().record({
      action: input.id ? 'UPDATE' : 'CREATE',
      targetType: 'PROJECT',
      targetId: saved.id,
      targetTitle: saved.name,
      details: `${input.id ? 'แก้ไข' : 'สร้าง'}${saved.name} (สมาชิก ${saved.memberIds.length} คน)`,
    })
    return saved
  }

  /** delete a team; returns the projects it was removed from (the project store updates them) */
  async function deleteTeam(id: string) {
    const target = teams.value.find((t) => t.id === id)
    const changed = await teamApi.deleteTeam(id)
    teams.value = teams.value.filter((t) => t.id !== id)
    audit().record({ action: 'DELETE', targetType: 'PROJECT', targetId: id, targetTitle: target?.name ?? id, details: `ลบ${target?.name ?? 'ทีม'}` })
    return changed
  }

  return {
    users,
    roles,
    teams,
    currentUser,
    teamsOf,
    membersOf,
    userIdsByName,
    switchUser,
    saveTeam,
    deleteTeam,
    currentRole,
    isAdmin,
    hasRole,
    roleOptions,
    load,
    can,
    roleOf,
    roleById,
    usersIn,
    loginAs,
    updateUserRole,
    addUser,
    saveRole,
    deleteRole,
  }
})
