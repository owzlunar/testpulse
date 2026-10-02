import type { PermissionKey, Role, RoleInput } from '@/types'
import { ApiError } from '@/api/errors'
import { ADMIN_ROLE_ID, ALL_PERMISSIONS } from '@/domain/role'
import { newId } from '@/utils/ids'
import { respond } from './http'
import { assertCan } from './project'
import { STORAGE_KEYS, load, migrateOnce, save } from './storage'
import { storedUsers } from './user'

const at = '2026-09-01T09:00:00Z'

const VIEW_ALL: PermissionKey[] = [
  'requirement.view',
  'case.view',
  'run.view',
  'defect.view',
  'calendar.view',
  'document.view',
  'report.view',
  'notification.receive',
]

export const DEFAULT_ROLES: Role[] = [
  {
    id: ADMIN_ROLE_ID,
    name: 'Admin',
    description: 'ผู้ดูแลระบบ ทำได้ทุกอย่าง และเป็น Role เดียวที่จัดการผู้ใช้ Role ทีม และโปรเจกต์ได้',
    discipline: 'other',
    tone: 'primary',
    icon: 'tabler:user-shield',
    permissions: ALL_PERMISSIONS,
    builtIn: 'admin',
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'role-qa-lead',
    name: 'QA Lead',
    description: 'หัวหน้าทีมทดสอบ วางแผนรอบทดสอบ ดูแล Requirement จัดลำดับเคส ปิด Defect และลงนามเอกสาร',
    discipline: 'qa',
    tone: 'success',
    icon: 'tabler:crown',
    permissions: [
      ...VIEW_ALL,
      'requirement.edit',
      'requirement.delete',
      'case.edit',
      'case.archive',
      'case.delete',
      'case.reorder',
      'case.restoreVersion',
      'run.create',
      'run.execute',
      'run.close',
      'defect.report',
      'defect.resolve',
      'document.create',
      'document.sign',
      'audit.view',
    ],
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'role-qa-tester',
    name: 'QA Tester',
    description: 'ผู้ทดสอบ เขียนและแก้ Test Case บันทึกผลการทดสอบ รายงาน Defect และออกเอกสาร UAT',
    discipline: 'qa',
    tone: 'info',
    icon: 'tabler:flask',
    permissions: [...VIEW_ALL, 'case.edit', 'case.archive', 'run.execute', 'defect.report', 'document.create'],
    createdAt: at,
    updatedAt: at,
  },
  {
    id: 'role-dev',
    name: 'Developer',
    description: 'นักพัฒนา ดูขั้นตอนทดสอบ ส่งมอบงานพร้อมเทส และอัปเดตความคืบหน้าของ Defect',
    discipline: 'dev',
    tone: 'warning',
    icon: 'tabler:code',
    permissions: [...VIEW_ALL, 'case.handoff', 'defect.report'],
    createdAt: at,
    updatedAt: at,
  },
]

// --- API ------------------------------------------------------------------------
function roles(): Role[] {
  // roles copied from Admin before copies were sanitised carried builtIn: 'admin' (= Admin powers):
  // only the real Admin role keeps it; the copy keeps its permissions as an ordinary role
  migrateOnce('roles-single-admin-v1', () => {
    const list = load(STORAGE_KEYS.roles, DEFAULT_ROLES)
    list.forEach((r) => r.id !== ADMIN_ROLE_ID && delete r.builtIn)
    save(STORAGE_KEYS.roles, list)
  })
  return load(STORAGE_KEYS.roles, DEFAULT_ROLES)
}

/** server-side: the stored role of a user (null: no role) */
export const roleById = (id: string | null | undefined): Role | null => (id ? (roles().find((r) => r.id === id) ?? null) : null)

/** GET /roles */
export const fetchRoles = () => respond(roles)

/**
 * POST /roles · PUT /roles/:id (Admin only)
 * The Admin role keeps every permission; names are unique; unknown permission keys are dropped.
 */
export const saveRole = (input: RoleInput) =>
  respond(() => {
    assertCan('admin')
    const list = roles()
    // builtIn is the server's to decide: there is exactly one Admin role, and no request can make another
    const { builtIn: _ignored, ...fields } = input as RoleInput & { builtIn?: Role['builtIn'] }
    const name = fields.name.trim()
    if (!name) throw new ApiError('ต้องระบุชื่อ Role', 422)
    if (list.some((r) => r.id !== input.id && r.name.toLowerCase() === name.toLowerCase())) throw new ApiError(`มี Role ชื่อ "${name}" อยู่แล้ว`, 409)
    const permissions = ALL_PERMISSIONS.filter((k) => fields.permissions.includes(k))
    const now = new Date().toISOString()
    if (input.id) {
      const role = list.find((r) => r.id === input.id)
      if (!role) throw new ApiError('ไม่พบ Role', 404)
      Object.assign(role, { ...fields, name, permissions: role.builtIn ? ALL_PERMISSIONS : permissions, updatedAt: now })
      save(STORAGE_KEYS.roles, list)
      return role
    }
    const created: Role = { ...fields, id: newId('role'), name, permissions, createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.roles, [...list, created])
    return created
  })

/**
 * DELETE /roles/:id?moveTo=:roleId (Admin only)
 * Its users move to `moveTo` (or have no role). The Admin role can't be deleted.
 * Returns the users that moved.
 */
export const deleteRole = (id: string, moveTo: string | null) =>
  respond(() => {
    assertCan('admin')
    const list = roles()
    const role = list.find((r) => r.id === id)
    if (!role) throw new ApiError('ไม่พบ Role', 404)
    if (role.builtIn) throw new ApiError(`ลบ Role ${role.name} ไม่ได้`, 409)
    if (moveTo && (moveTo === id || !list.some((r) => r.id === moveTo))) throw new ApiError('Role ปลายทางไม่ถูกต้อง', 422)
    const users = storedUsers()
    const moved = users.filter((u) => u.roleId === id)
    moved.forEach((u) => (u.roleId = moveTo))
    save(STORAGE_KEYS.users, users)
    save(
      STORAGE_KEYS.roles,
      list.filter((r) => r.id !== id),
    )
    return moved
  })
