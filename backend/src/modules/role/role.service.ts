import type { ClientSession } from 'mongoose'
import type { Role, RoleInput, User } from '#contract/types.js'
import { transaction } from '#core/database/transaction.js'
import { emit } from '#core/events/event-bus.js'
import { ApiError } from '#core/http/errors.js'
import { roleRepository } from './role.repository.js'
import { ADMIN_ROLE, ADMIN_ROLE_ID, ALL_PERMISSIONS, isPermissionKey } from './role.permissions.js'

declare module '#core/events/event-bus.js' {
  interface DomainEvents {
    /** a role is being deleted (same transaction): its users move to `moveTo` (null = no role); handlers return the moved users */
    'role.deleted': { roleId: string; moveTo: string | null; session: ClientSession }
  }
}

/** what a client may set (builtIn and timestamps are the server's) */
export type RoleFields = Omit<RoleInput, 'id'>

const cleanPermissions = (keys: string[]) => ALL_PERMISSIONS.filter((k) => keys.includes(k) && isPermissionKey(k))

async function assertNameFree(name: string, exceptId?: string) {
  const other = await roleRepository.findByName(name)
  if (other && other.id !== exceptId) throw ApiError.conflict(`มี Role ชื่อ "${name.trim()}" อยู่แล้ว`, 'duplicate')
}

export const roleService = {
  list: (): Promise<Role[]> => roleRepository.find(),

  findById: (id: string): Promise<Role | null> => roleRepository.findById(id),

  async create(fields: RoleFields): Promise<Role> {
    await assertNameFree(fields.name)
    return roleRepository.create({ ...fields, name: fields.name.trim(), permissions: cleanPermissions(fields.permissions) })
  },

  /** the Admin role keeps every permission and its discipline; only its name and look change */
  async update(id: string, fields: RoleFields): Promise<Role> {
    const role = await roleRepository.findById(id)
    if (!role) throw ApiError.notFound('ไม่พบ Role')
    await assertNameFree(fields.name, id)
    const set = role.builtIn
      ? { name: fields.name.trim(), description: fields.description, tone: fields.tone, icon: fields.icon }
      : { ...fields, name: fields.name.trim(), permissions: cleanPermissions(fields.permissions) }
    return (await roleRepository.update(id, set))!
  },

  /** its users move to `moveTo` (or have no role); returns the users that moved */
  async remove(id: string, moveTo: string | null): Promise<User[]> {
    const role = await roleRepository.findById(id)
    if (!role) throw ApiError.notFound('ไม่พบ Role')
    if (role.builtIn) throw ApiError.conflict(`ลบ Role ${role.name} ไม่ได้`)
    if (moveTo && (moveTo === id || !(await roleRepository.exists({ _id: moveTo })))) throw ApiError.unprocessable('Role ปลายทางไม่ถูกต้อง')
    return transaction(async (session) => {
      const moved = (await emit('role.deleted', { roleId: id, moveTo, session })).flat() as User[]
      await roleRepository.deleteById(id, session)
      return moved
    })
  },

  /** start-up: the built-in Admin role always exists and has every permission */
  async ensureAdminRole(): Promise<void> {
    const admin = await roleRepository.findById(ADMIN_ROLE_ID)
    if (!admin) {
      const { id, ...fields } = ADMIN_ROLE
      await roleRepository.create({ _id: id, ...fields })
    } else if (admin.permissions.length !== ALL_PERMISSIONS.length || admin.builtIn !== 'admin') {
      await roleRepository.update(ADMIN_ROLE_ID, { permissions: [...ALL_PERMISSIONS], builtIn: 'admin' })
    }
  },
}
