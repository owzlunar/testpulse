import type { InviteInfo, RegisterInput, User } from '@/types'

// Sign-in and the session. The real client keeps the access token in memory and the refresh token
// in an httpOnly cookie; callers only ever see the user.
export interface AuthApi {
  /**
   * GET /auth/me: the signed-in user. On a fresh page the real client first restores the session
   * (POST /auth/refresh, cookie); without one it fails with 401.
   */
  fetchSession(): Promise<User>

  /** POST /auth/login { email, password } */
  login(email: string, password: string): Promise<User>

  /** POST /auth/logout (ends this sign-in) */
  logout(): Promise<void>

  /** POST /auth/register: a new active account without a role (an Admin gives one later) */
  register(input: RegisterInput): Promise<User>

  /** GET /auth/invites/:token: who an invite link is for (404 when used or expired) */
  fetchInvite(token: string): Promise<InviteInfo>

  /** POST /auth/invites/:token/accept { password }: sets the password and signs in */
  acceptInvite(token: string, password: string): Promise<User>

  /** PUT /me/password { currentPassword, newPassword }: other sessions are signed out */
  changePassword(currentPassword: string, newPassword: string): Promise<void>
}
