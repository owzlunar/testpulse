import { login } from '@/api/mock/user'
import { MOCK_USERS } from '@/api/mock/seeds/users.seed'
import type { Actor } from '@/types'

/** seed users (src/api/mock/seeds/users.seed.ts) */
export const USERS = {
  admin: 'user-admin',
  qaLead: 'user-qa-1', // QA Lead, team Payment
  dev: 'user-dev-1', // Developer, team Payment
  devBoth: 'user-dev-2', // Developer, teams Payment + E-Commerce
  tester: 'user-qa-2', // QA Tester, team E-Commerce
} as const

/** sign in (the services read the signed-in user from the session, like a backend) */
export async function signIn(userId: string): Promise<Actor> {
  const user = await login(MOCK_USERS.find((u) => u.id === userId)!.email, 'any password')
  return { id: user.id, name: user.name, avatar: user.avatar }
}

/** expect a promise to be refused with an ApiError of this HTTP status */
export async function refusal(promise: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await promise
  } catch (e) {
    const err = e as { status?: number; message: string }
    return { status: err.status ?? 0, message: err.message }
  }
  throw new Error('expected the request to be refused')
}
