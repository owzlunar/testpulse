import type { UserApi } from '@/api/contract'
import type { User } from '@/types'
import { get, patch, post } from './http'

export const userApi: UserApi = {
  fetchUsers: () => get<User[]>('/users'),
  inviteUser: (input) => post<User>('/users', input),
  updateUser: (id, changes) => patch<User>(`/users/${id}`, changes),
  async resendInvite(id) {
    await post(`/users/${id}/invite`)
  },
}
