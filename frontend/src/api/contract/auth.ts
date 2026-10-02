import type { User } from '@/types'

export interface AuthApi {
  /** GET /auth/me */
  fetchSession(): Promise<User>

  /** POST /auth/login (mock: no password check) */
  login(userId: string): Promise<User>
}
