import type * as Contract from './contract'
import * as mock from './mock'

// TRANSITION ONLY: some modules on the real backend, others still on the mock. These wrappers keep
// the two consistent; delete this file (and its uses in index.ts) once every module is real.
//   - signed in for real -> the mock acts for the same user (its access checks)
//   - real projects get their case counts from the mock's test cases

const adopt =
  <A extends unknown[]>(fn: (...args: A) => Promise<import('@/types').User>) =>
  async (...args: A) => {
    const user = await fn(...args)
    mock.adoptSession(user)
    return user
  }

export const withMockSession = (api: Contract.AuthApi): Contract.AuthApi => ({
  ...api,
  fetchSession: adopt(api.fetchSession),
  login: adopt(api.login),
  register: adopt(api.register),
  acceptInvite: adopt(api.acceptInvite),
  async logout() {
    await api.logout()
    mock.adoptSession(null)
  },
})

export const withMockCaseStats = (api: Contract.ProjectApi): Contract.ProjectApi => ({
  ...api,
  fetchProjects: async () => (await api.fetchProjects()).map((p) => ({ ...p, caseStats: mock.mockCaseStats(p.id) })),
})
