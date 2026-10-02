import type { ClientSession } from 'mongoose'
import type { User } from '#contract/types.js'
import type { Principal } from '#core/auth/principal.js'
import { emit } from '#core/events/event-bus.js'
import { ApiError } from '#core/http/errors.js'
import { ADMIN_ROLE_ID, roles } from '#modules/role/index.js'
import { userRepository } from './user.repository.js'

declare module '#core/events/event-bus.js' {
  interface DomainEvents {
    /** an Admin added someone: they still have to set a password (the auth module sends the invite) */
    'user.invited': { user: User }
  }
}

/** profile fields an Admin sets */
export interface UserFields {
  name: string
  email: string
  roleId: string | null
  title?: string
  avatar?: string
}

export const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'

async function assertEmailFree(email: string, exceptId?: string) {
  const other = await userRepository.findByEmail(email)
  if (other && other.id !== exceptId) throw ApiError.conflict('อีเมลนี้มีบัญชีอยู่แล้ว', 'duplicate')
}

async function assertRoleExists(roleId: string | null | undefined) {
  if (roleId && !(await roles.findById(roleId))) throw ApiError.unprocessable('ไม่พบ Role ที่เลือก')
}

export const userService = {
  list: (): Promise<User[]> => userRepository.find(),

  findById: (id: string): Promise<User | null> => userRepository.findById(id),

  findByEmail: (email: string): Promise<User | null> => userRepository.findByEmail(email),

  passwordHashOf: (id: string) => userRepository.passwordHashOf(id),

  /** Admin adds a user: no password yet, they get an invite to set one */
  async invite(fields: UserFields): Promise<User> {
    await assertEmailFree(fields.email)
    await assertRoleExists(fields.roleId)
    const user = await userRepository.create({ ...fields, avatar: fields.avatar || DEFAULT_AVATAR, status: 'invited' })
    await emit('user.invited', { user })
    return user
  },

  /** self-registration: active right away, without a role until an Admin gives one */
  async register(fields: Omit<UserFields, 'roleId'>, passwordHash: string): Promise<User> {
    await assertEmailFree(fields.email)
    return userRepository.create({ ...fields, avatar: fields.avatar || DEFAULT_AVATAR, roleId: null, status: 'active', passwordHash })
  },

  async update(id: string, patch: Partial<UserFields>): Promise<User> {
    const user = await userRepository.findById(id)
    if (!user) throw ApiError.notFound('ไม่พบผู้ใช้')
    if (patch.email) await assertEmailFree(patch.email, id)
    if ('roleId' in patch) {
      await assertRoleExists(patch.roleId)
      // never leave the system without an Admin (only Admins manage users and roles)
      if (user.roleId === ADMIN_ROLE_ID && patch.roleId !== ADMIN_ROLE_ID && (await userRepository.countWithRole(ADMIN_ROLE_ID)) === 1) {
        throw ApiError.conflict('ต้องมี Admin อย่างน้อย 1 คน เปลี่ยน Role ของ Admin คนสุดท้ายไม่ได้', 'last_admin')
      }
    }
    return (await userRepository.updateById(id, patch))!
  },

  /** someone can sign in as Admin */
  hasActiveAdmin: async (): Promise<boolean> => (await userRepository.countActiveWithRole(ADMIN_ROLE_ID)) > 0,

  /** the first Admin (migration): active right away with the given password */
  async createAdmin(fields: Pick<UserFields, 'name' | 'email'>, passwordHash: string): Promise<User> {
    await assertEmailFree(fields.email)
    return userRepository.create({ ...fields, avatar: DEFAULT_AVATAR, roleId: ADMIN_ROLE_ID, status: 'active', passwordHash })
  },

  /** sets the password and makes an invited account active */
  async setPassword(id: string, passwordHash: string): Promise<User> {
    const user = await userRepository.updateById(id, { passwordHash, status: 'active' })
    if (!user) throw ApiError.notFound('ไม่พบผู้ใช้')
    return user
  },

  /** a deleted role's users move to another role (or none); one update each, so each is audited */
  async moveRole(fromRoleId: string, toRoleId: string | null, session: ClientSession): Promise<User[]> {
    const users = await userRepository.withRole(fromRoleId, session)
    const moved: User[] = []
    for (const u of users) moved.push((await userRepository.updateById(u.id, { roleId: toRoleId }, session))!)
    return moved
  },

  /** who is signed in, with their role's permissions (read on every request) */
  async principalOf(userId: string): Promise<Principal | null> {
    const user = await userRepository.findById(userId)
    if (!user || user.status === 'invited') return null
    const role = user.roleId ? await roles.findById(user.roleId) : null
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: role?.id ?? null,
      roleName: role?.name ?? null,
      discipline: role?.discipline ?? null,
      isAdmin: role?.builtIn === 'admin',
      permissions: new Set(role?.permissions ?? []),
    }
  },
}
