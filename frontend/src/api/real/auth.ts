import type { AuthApi } from '@/api/contract'
import type { InviteInfo, RegisterInput, User } from '@/types'
import { get, put, refreshSession, request, setAccessToken, startSession } from './http'

export const authApi: AuthApi = {
  async fetchSession() {
    // a fresh page has no access token yet: restore the session from the refresh cookie first;
    // without one, /auth/me answers 401 and the app shows the login page
    await refreshSession()
    return request<User>('GET', '/auth/me', { retry: false })
  },
  login: (email, password) => startSession<User>('POST', '/auth/login', { email, password }),
  async logout() {
    await request('POST', '/auth/logout', { retry: false }).catch(() => undefined)
    setAccessToken(null)
  },
  register: (input: RegisterInput) => startSession<User>('POST', '/auth/register', input),
  fetchInvite: (token) => get<InviteInfo>(`/auth/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token, password) => startSession<User>('POST', `/auth/invites/${encodeURIComponent(token)}/accept`, { password }),
  async changePassword(currentPassword, newPassword) {
    // the server signs out every other session and starts a new one for this tab
    const session = await put<{ accessToken: string }>('/me/password', { currentPassword, newPassword })
    setAccessToken(session.accessToken)
  },
}
