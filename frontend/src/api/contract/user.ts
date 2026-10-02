import type { User, UserInviteInput } from '@/types'

export interface UserApi {
  /** GET /users */
  fetchUsers(): Promise<User[]>

  /** POST /users (Admin): the new user gets an email invite to set a password (status 'invited') */
  inviteUser(input: UserInviteInput): Promise<User>

  /** PATCH /users/:id (Admin); the last Admin can't lose the Admin role (409) */
  updateUser(id: string, patch: Partial<User>): Promise<User>

  /** POST /users/:id/invite (Admin): send the invite again (the earlier link stops working) */
  resendInvite(id: string): Promise<void>
}
