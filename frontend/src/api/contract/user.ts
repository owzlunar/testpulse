import type { User } from '@/types'

export interface UserApi {
  /** GET /users */
  fetchUsers(): Promise<User[]>

  /** POST /users */
  createUser(input: Omit<User, 'id'>): Promise<User>

  /** PATCH /users/:id */
  updateUser(id: string, patch: Partial<User>): Promise<User>
}
