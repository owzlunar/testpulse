import type { User } from '@/types'
import { ApiError, newId, respond } from './http'
import { ADMIN_ROLE_ID } from './role.service'
import { assertCan } from './project.service'
import { STORAGE_KEYS, load, migrateOnce, save } from './storage.service'
import { MOCK_USERS } from './seeds/users.seed'

export { MOCK_USERS }

/** Default avatar for users added from the UI */
export const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'

// --- API ------------------------------------------------------------------------
/** users saved before roles were editable had a fixed `role`: map it to the matching built-in role once */
const LEGACY_ROLES: Record<string, string> = { ADMIN: 'role-admin', DEV: 'role-dev', QA: 'role-qa-tester' }

/** server-side: every stored user (seeds the demo data on first use) */
export const storedUsers = (): User[] => users()

function users(): User[] {
  migrateOnce('user-roles-v1', () => {
    const list = load<(User & { role?: string })[]>(STORAGE_KEYS.users, MOCK_USERS)
    list.forEach((u) => {
      if (u.roleId === undefined) u.roleId = u.id === 'user-qa-1' ? 'role-qa-lead' : (LEGACY_ROLES[u.role ?? ''] ?? null)
      delete u.role
    })
    save(STORAGE_KEYS.users, list)
  })
  return load(STORAGE_KEYS.users, MOCK_USERS)
}

/** GET /users */
export const fetchUsers = () => respond(users)

/** POST /users */
export const createUser = (input: Omit<User, 'id'>) =>
  respond(() => {
    // public sign-up can only create a user without a role; giving one is an Admin's job
    if (input.roleId) assertCan('admin')
    const user: User = { ...input, id: newId('user') }
    save(STORAGE_KEYS.users, [...users(), user])
    return user
  })

/** PATCH /users/:id */
export const updateUser = (id: string, patch: Partial<User>) =>
  respond(() => {
    assertCan('admin')
    const list = users()
    const user = list.find((u) => u.id === id)
    if (!user) throw new ApiError('ไม่พบผู้ใช้', 404)
    // never leave the system without an Admin (only Admins manage users and roles)
    const admins = list.filter((u) => u.roleId === ADMIN_ROLE_ID)
    if ('roleId' in patch && patch.roleId !== ADMIN_ROLE_ID && admins.length === 1 && admins[0].id === id) {
      throw new ApiError('ต้องมี Admin อย่างน้อย 1 คน เปลี่ยน Role ของ Admin คนสุดท้ายไม่ได้', 409)
    }
    Object.assign(user, patch)
    save(STORAGE_KEYS.users, list)
    return user
  })

/** server-side: the signed-in user (the real backend reads it from the session token) */
export const sessionUser = (): User | null => {
  const session = load<User>(STORAGE_KEYS.currentUser, MOCK_USERS[0])
  return session ? (users().find((u) => u.id === session.id) ?? null) : null
}

/** GET /auth/me */
export const fetchSession = () => respond(() => load(STORAGE_KEYS.currentUser, MOCK_USERS[0]), 100)

/** POST /auth/login (mock: no password check) */
export const login = (userId: string) =>
  respond(() => {
    const user = users().find((u) => u.id === userId)
    if (!user) throw new ApiError('ไม่พบบัญชีผู้ใช้', 401)
    save(STORAGE_KEYS.currentUser, user)
    return user
  })
