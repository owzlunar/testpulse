import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { PermissionKey, RolePermission, User, UserRole } from '@/types'
import * as api from '@/services/user.service'

// Session (mock login / role switching), users and the RBAC matrix
export const useAuthStore = defineStore('auth', () => {
  const users = ref<User[]>([])
  const permissions = ref<RolePermission[]>([])
  const currentUser = ref<User>(api.MOCK_USERS[0])

  const currentRolePermissions = computed(
    () => permissions.value.find((p) => p.role === currentUser.value.role) ?? permissions.value[0],
  )

  async function load() {
    const [list, perms, session] = await Promise.all([api.fetchUsers(), api.fetchPermissions(), api.fetchSession()])
    users.value = list
    permissions.value = perms
    currentUser.value = list.find((u) => u.id === session.id) ?? list[0] ?? session
  }

  async function loginAs(user: User) {
    currentUser.value = await api.login(user.id)
  }

  async function updateUserRole(userId: string, role: UserRole) {
    const saved = await api.updateUser(userId, { role })
    users.value = users.value.map((u) => (u.id === userId ? saved : u))
    if (currentUser.value.id === userId) currentUser.value = saved
  }

  async function addUser(input: Omit<User, 'id'>): Promise<User> {
    const user = await api.createUser(input)
    users.value.push(user)
    return user
  }

  async function updatePermission(role: UserRole, patch: Partial<RolePermission>) {
    const saved = await api.updatePermission(role, patch)
    permissions.value = permissions.value.map((p) => (p.role === role ? saved : p))
  }

  function can(key: PermissionKey): boolean {
    return !!currentRolePermissions.value?.[key]
  }

  return { users, permissions, currentUser, currentRolePermissions, load, loginAs, updateUserRole, addUser, updatePermission, can }
})
