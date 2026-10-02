import type { RoleApi } from '@/api/contract'
import type { Role, User } from '@/types'
import { del, get, post, put } from './http'

export const roleApi: RoleApi = {
  fetchRoles: () => get<Role[]>('/roles'),
  saveRole: ({ id, ...fields }) => (id ? put<Role>(`/roles/${id}`, fields) : post<Role>('/roles', fields)),
  deleteRole: (id, moveTo) => del<User[]>(`/roles/${id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`),
}
