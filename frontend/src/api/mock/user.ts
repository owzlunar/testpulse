import type { InviteInfo, RegisterInput, User, UserInviteInput } from '@/types'
import { ApiError } from '@/api/errors'
import { ADMIN_ROLE_ID } from '@/domain/role'
import { DEFAULT_AVATAR } from '@/domain/user'
import { newId } from '@/utils/ids'
import { respond } from './http'
import { assertCan } from './project'
import { MOCK_USERS } from './seeds/users.seed'
import { STORAGE_KEYS, load, migrateOnce, save } from './storage'

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
function addUser(input: Omit<User, 'id'>): User {
  if (users().some((u) => u.email.toLowerCase() === input.email.toLowerCase())) throw new ApiError('อีเมลนี้มีบัญชีอยู่แล้ว', 409, 'duplicate')
  const user: User = { ...input, avatar: input.avatar || DEFAULT_AVATAR, id: newId('user') }
  save(STORAGE_KEYS.users, [...users(), user])
  return user
}

/** POST /users (Admin). The mock sends no mail: the new user can sign in right away (any password). */
export const inviteUser = (input: UserInviteInput) =>
  respond(() => {
    assertCan('admin')
    return addUser({ avatar: DEFAULT_AVATAR, ...input })
  })

/** POST /users/:id/invite (the mock has no invites: nothing to send) */
export const resendInvite = (id: string) =>
  respond(() => {
    assertCan('admin')
    if (!users().some((u) => u.id === id)) throw new ApiError('ไม่พบผู้ใช้', 404)
  })

/** POST /auth/register: a new account without a role, signed in (the mock keeps no passwords) */
export const register = (input: RegisterInput) =>
  respond(() => {
    const { password: _password, ...profile } = input
    const user = addUser({ ...profile, roleId: null, avatar: DEFAULT_AVATAR })
    save(STORAGE_KEYS.currentUser, user)
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

/** POST /auth/login (mock: any password signs in as the user with that email) */
export const login = (email: string, _password: string) =>
  respond(() => {
    const user = users().find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!user) throw new ApiError('อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401, 'unauthorized')
    save(STORAGE_KEYS.currentUser, user)
    return user
  })

/** POST /auth/logout (the mock signs back in as the first demo user on the next load) */
export const logout = () => respond(() => localStorage.removeItem(STORAGE_KEYS.currentUser), 50)

/** GET /auth/invites/:token (the mock sends no invites) */
export const fetchInvite = (_token: string): Promise<InviteInfo> =>
  respond(() => {
    throw new ApiError('ลิงก์เชิญหมดอายุหรือถูกใช้ไปแล้ว ติดต่อ Admin เพื่อขอลิงก์ใหม่', 404, 'not_found')
  })

/** POST /auth/invites/:token/accept (the mock sends no invites) */
export const acceptInvite = (token: string, _password: string): Promise<User> => fetchInvite(token).then(() => sessionUser()!)

/** PUT /me/password (the mock keeps no passwords) */
export const changePassword = (_currentPassword: string, _newPassword: string) => respond(() => undefined)

export { MOCK_USERS }
