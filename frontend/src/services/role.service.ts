import type { Option, PermissionKey, Role, RoleDiscipline, RoleInput, Tone, User } from '@/types'
import { ApiError, newId, respond } from './http'
import { STORAGE_KEYS, load, save } from './storage.service'

// Role groups and the permission catalog. Users without a role see only the dashboard and settings;
// managing users, roles, teams and projects belongs to the built-in Admin role and is not grantable.

export const PERMISSION_GROUPS: { module: string; icon: string; items: { key: PermissionKey; label: string; description: string }[] }[] = [
  {
    module: 'Requirements',
    icon: 'tabler:clipboard-list',
    items: [
      { key: 'requirement.view', label: 'ดู Requirement', description: 'เปิดหน้า Requirements และ Traceability Matrix' },
      { key: 'requirement.edit', label: 'สร้าง / แก้ไข', description: 'เพิ่มและแก้ Requirement (เคสที่ผูกไว้จะถูกแจ้งให้ทบทวน)' },
      { key: 'requirement.delete', label: 'ลบ', description: 'ลบ Requirement ออกจากระบบ' },
    ],
  },
  {
    module: 'Test Cases',
    icon: 'tabler:flask',
    items: [
      { key: 'case.view', label: 'ดู Test Case', description: 'เปิดหน้า Test Cases และดูรายละเอียด' },
      { key: 'case.edit', label: 'สร้าง / แก้ไข', description: 'สร้าง นำเข้า แก้ไขข้อกำหนดและขั้นตอน ทำสำเนา และบันทึกว่าทบทวนแล้ว' },
      { key: 'case.archive', label: 'เก็บเข้าคลัง / กู้คืน', description: 'ซ่อนเคสจากการใช้งาน และกู้คืนจากคลัง' },
      { key: 'case.delete', label: 'ลบถาวร', description: 'ลบเคสในคลังออกจากระบบ (กู้คืนไม่ได้)' },
      { key: 'case.reorder', label: 'จัดลำดับ', description: 'ลากหรือย้ายตำแหน่งเคส ระบบจะรันรหัสใหม่' },
      { key: 'case.restoreVersion', label: 'กู้คืนเวอร์ชัน', description: 'นำเนื้อหาของเวอร์ชันก่อนหน้ากลับมาเป็นเวอร์ชันใหม่' },
      { key: 'case.handoff', label: 'ส่งมอบพร้อมเทส', description: 'เปลี่ยนสถานะเป็น Ready for Test เพื่อส่งต่อให้ QA' },
    ],
  },
  {
    module: 'รอบการทดสอบ',
    icon: 'tabler:player-play',
    items: [
      { key: 'run.view', label: 'ดูรอบการทดสอบ', description: 'เปิดรายการรอบและผลการทดสอบ' },
      { key: 'run.create', label: 'สร้างรอบ', description: 'สร้างรอบการทดสอบใหม่และเลือกเคส' },
      { key: 'run.execute', label: 'บันทึกผล', description: 'ตัดสินผล Passed / Failed / Blocked และแนบหลักฐาน' },
      { key: 'run.close', label: 'ปิดรอบ', description: 'ปิดรอบการทดสอบ (แก้ผลไม่ได้อีก)' },
    ],
  },
  {
    module: 'Defects',
    icon: 'tabler:bug',
    items: [
      { key: 'defect.view', label: 'ดู Defect', description: 'เปิดหน้า Defects' },
      { key: 'defect.report', label: 'รายงาน / แก้ไข', description: 'รายงาน Defect ใหม่ แก้ไข แสดงความเห็น และอัปเดตความคืบหน้า' },
      { key: 'defect.resolve', label: 'ปิด / ปฏิเสธ', description: 'ปิด Defect หลังทดสอบซ้ำผ่าน หรือปฏิเสธ' },
    ],
  },
  {
    module: 'ปฏิทิน',
    icon: 'tabler:calendar-event',
    items: [{ key: 'calendar.view', label: 'ดูปฏิทินงานทดสอบ', description: 'เปิดปฏิทิน กำหนดส่ง และ Milestone' }],
  },
  {
    module: 'เอกสาร',
    icon: 'tabler:files',
    items: [
      { key: 'document.view', label: 'ดูเอกสาร', description: 'เปิดศูนย์เอกสารและดาวน์โหลด' },
      { key: 'document.create', label: 'สร้างเอกสาร UAT', description: 'ออกเอกสารตรวจรับ UAT และรายงานทางการ' },
      { key: 'document.sign', label: 'อนุมัติ / ลงนาม', description: 'ลงนามหรือปฏิเสธเอกสารที่รอลงนาม' },
    ],
  },
  {
    module: 'รายงาน',
    icon: 'tabler:report-analytics',
    items: [{ key: 'report.view', label: 'ดูรายงาน', description: 'เปิดหน้ารายงานและสถิติ' }],
  },
  {
    module: 'การแจ้งเตือน',
    icon: 'tabler:bell',
    items: [{ key: 'notification.receive', label: 'รับการแจ้งเตือน', description: 'เห็นกระดิ่งและได้รับการแจ้งเตือนในระบบ' }],
  },
  {
    module: 'ผู้ดูแลระบบ',
    icon: 'tabler:shield-lock',
    items: [{ key: 'audit.view', label: 'ดู Audit Logs', description: 'เรียกดูประวัติการกระทำทั้งหมดในระบบ' }],
  },
]

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))
export const permissionOf = (key: PermissionKey) => PERMISSION_GROUPS.flatMap((g) => g.items).find((i) => i.key === key)

export const DISCIPLINES: Option<RoleDiscipline>[] = [
  { value: 'qa', label: 'QA', hint: 'อยู่ในรายชื่อ QA ผู้รับผิดชอบ และเห็นงานฝั่งทดสอบ', tone: 'success', icon: 'tabler:flask' },
  { value: 'dev', label: 'Developer', hint: 'อยู่ในรายชื่อ Developer ผู้รับผิดชอบ และเห็นงานฝั่งแก้ไข', tone: 'info', icon: 'tabler:code' },
  { value: 'other', label: 'อื่นๆ', hint: 'ไม่อยู่ในรายชื่อผู้รับผิดชอบ เช่น PM หรือผู้บริหาร', tone: 'secondary', icon: 'tabler:briefcase' },
]

/** colours and icons a role can pick (theme tones only) */
export const ROLE_TONES: Tone[] = ['primary', 'secondary', 'info', 'success', 'warning', 'caution', 'error']
export const ROLE_ICONS = [
  'tabler:user-shield', 'tabler:crown', 'tabler:flask', 'tabler:checklist', 'tabler:code', 'tabler:bug',
  'tabler:briefcase', 'tabler:chart-bar', 'tabler:eye', 'tabler:user',
]

/** how a user without a role is shown */
export const NO_ROLE: Option<'none'> = { value: 'none', label: 'ยังไม่มี Role', hint: 'เห็นเฉพาะภาพรวมและตั้งค่า', tone: 'secondary', icon: 'tabler:user-question' }

const at = '2026-09-01T09:00:00Z'
const VIEW_ALL: PermissionKey[] = ['requirement.view', 'case.view', 'run.view', 'defect.view', 'calendar.view', 'document.view', 'report.view', 'notification.receive']

export const ADMIN_ROLE_ID = 'role-admin'

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
    permissions: [...VIEW_ALL, 'requirement.edit', 'requirement.delete', 'case.edit', 'case.archive', 'case.delete', 'case.reorder',
      'case.restoreVersion', 'run.create', 'run.execute', 'run.close', 'defect.report', 'defect.resolve', 'document.create', 'document.sign', 'audit.view'],
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
const roles = () => load(STORAGE_KEYS.roles, DEFAULT_ROLES)

/** server-side: the stored role of a user (null: no role) */
export const roleById = (id: string | null | undefined): Role | null => (id ? roles().find((r) => r.id === id) ?? null : null)

/** GET /roles */
export const fetchRoles = () => respond(roles)

/**
 * POST /roles · PUT /roles/:id (Admin only)
 * The Admin role keeps every permission; names are unique; unknown permission keys are dropped.
 */
export const saveRole = (input: RoleInput) =>
  respond(() => {
    const list = roles()
    const name = input.name.trim()
    if (!name) throw new ApiError('ต้องระบุชื่อ Role', 422)
    if (list.some((r) => r.id !== input.id && r.name.toLowerCase() === name.toLowerCase())) throw new ApiError(`มี Role ชื่อ "${name}" อยู่แล้ว`, 409)
    const permissions = ALL_PERMISSIONS.filter((k) => input.permissions.includes(k))
    const now = new Date().toISOString()
    if (input.id) {
      const role = list.find((r) => r.id === input.id)
      if (!role) throw new ApiError('ไม่พบ Role', 404)
      Object.assign(role, { ...input, name, permissions: role.builtIn ? ALL_PERMISSIONS : permissions, updatedAt: now })
      save(STORAGE_KEYS.roles, list)
      return role
    }
    const created: Role = { ...input, id: newId('role'), name, permissions, createdAt: now, updatedAt: now }
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
    const list = roles()
    const role = list.find((r) => r.id === id)
    if (!role) throw new ApiError('ไม่พบ Role', 404)
    if (role.builtIn) throw new ApiError(`ลบ Role ${role.name} ไม่ได้`, 409)
    if (moveTo && (moveTo === id || !list.some((r) => r.id === moveTo))) throw new ApiError('Role ปลายทางไม่ถูกต้อง', 422)
    const users = load<User[]>(STORAGE_KEYS.users, [])
    const moved = users.filter((u) => u.roleId === id)
    moved.forEach((u) => (u.roleId = moveTo))
    save(STORAGE_KEYS.users, users)
    save(STORAGE_KEYS.roles, list.filter((r) => r.id !== id))
    return moved
  })
