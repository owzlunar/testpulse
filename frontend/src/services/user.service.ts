import type { Option, PermissionKey, RolePermission, User, UserRole } from '@/types'
import { ApiError, newId, respond } from './http'
import { STORAGE_KEYS, load, save } from './storage.service'

export const ROLES: Option<UserRole>[] = [
  { value: 'ADMIN', label: 'Admin', hint: 'ผู้ดูแลระบบ เข้าถึงได้ทุกส่วน', tone: 'primary', icon: 'tabler:user-shield' },
  { value: 'DEV', label: 'Developer', hint: 'ส่งมอบงานพร้อมเทส และแก้ Bug', tone: 'info', icon: 'tabler:code' },
  { value: 'QA', label: 'QA Tester', hint: 'สร้างเคส รันผลทดสอบ และออกเอกสาร UAT', tone: 'success', icon: 'tabler:flask' },
]

export const roleOf = (role: UserRole): Option<UserRole> => ROLES.find((r) => r.value === role) ?? ROLES[0]

/** Rows of the RBAC matrix (Permissions page) */
export const PERMISSIONS: { key: PermissionKey; label: string; description: string; icon: string }[] = [
  { key: 'canCreateCase', label: 'สร้าง Test Case', description: 'สร้างและบันทึก Test Case / Sub-case ใหม่', icon: 'tabler:circle-plus' },
  { key: 'canEditCase', label: 'แก้ไข Requirement และ Steps', description: 'ปรับ Requirement, Scenario และตารางขั้นตอนทดสอบ', icon: 'tabler:pencil' },
  { key: 'canDeleteCase', label: 'ลบ Test Case', description: 'ลบ Test Case ออกจากระบบถาวร', icon: 'tabler:trash' },
  { key: 'canMarkReadyForTest', label: 'ส่งมอบพร้อมเทส', description: 'เปลี่ยนสถานะเป็น Ready for Test เพื่อส่งต่อให้ QA', icon: 'tabler:send' },
  { key: 'canExecuteTest', label: 'รันผลการทดสอบ', description: 'ตัดสินผล Passed / Failed / Blocked และแนบหลักฐาน', icon: 'tabler:checks' },
  { key: 'canExportUat', label: 'สร้างเอกสาร UAT', description: 'ออกเอกสารตรวจรับ UAT Sign-off และรายงานทางการ', icon: 'tabler:certificate' },
  { key: 'canManageUsers', label: 'จัดการผู้ใช้และสิทธิ์', description: 'เปลี่ยน Role ของสมาชิกและปรับตาราง RBAC', icon: 'tabler:user-cog' },
  { key: 'canViewAuditLogs', label: 'ดู Audit Logs', description: 'เรียกดูประวัติการกระทำทั้งหมดในระบบ', icon: 'tabler:history' },
]

/** Default avatar for users added from the UI */
export const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'

export const MOCK_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'ศุภชัย วัฒนา (Admin)',
    email: 'admin@testpulse.dev',
    role: 'ADMIN',
    title: 'System Administrator',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-qa-1',
    name: 'สมชาย ประเสริฐ (QA Lead)',
    email: 'somchai.qa@testpulse.dev',
    role: 'QA',
    title: 'Lead QA Engineer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-dev-1',
    name: 'กิตติศักดิ์ พัฒนา (Dev Lead)',
    email: 'kittisak.dev@testpulse.dev',
    role: 'DEV',
    title: 'Fullstack Lead Developer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-dev-2',
    name: 'ธนากร สุขใจ (Backend API)',
    email: 'thanakorn.dev@testpulse.dev',
    role: 'DEV',
    title: 'Backend Engineer',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'user-qa-2',
    name: 'พิชญา ศรีสุข (Senior Tester)',
    email: 'pitchaya.qa@testpulse.dev',
    role: 'QA',
    title: 'Senior QA Tester',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
  },
]

export const DEFAULT_ROLE_PERMISSIONS: RolePermission[] = [
  {
    role: 'ADMIN',
    name: 'ผู้ดูแลระบบ (Administrator)',
    description: 'มีสิทธิ์สูงสุดในการจัดการผู้ใช้ สิทธิ์ และการตั้งค่าระบบทั้งหมด',
    canCreateCase: true,
    canEditCase: true,
    canDeleteCase: true,
    canMarkReadyForTest: true,
    canExecuteTest: true,
    canManageUsers: true,
    canExportUat: true,
    canViewAuditLogs: true,
  },
  {
    role: 'DEV',
    name: 'นักพัฒนา (Developer)',
    description: 'เข้าดู Test Steps ได้, กดส่งมอบงาน (Ready for Test), และรับ Noti เมื่อเคส Failed',
    canCreateCase: false,
    canEditCase: false,
    canDeleteCase: false,
    canMarkReadyForTest: true,
    canExecuteTest: false,
    canManageUsers: false,
    canExportUat: false,
    canViewAuditLogs: true,
  },
  {
    role: 'QA',
    name: 'ผู้ทดสอบระบบ (Quality Assurance)',
    description: 'สร้าง/แก้ไข Test Steps, รันผลทดสอบ (Pass/Fail), รับ Noti เมื่อ Dev ส่งงาน และออกเอกสาร UAT',
    canCreateCase: true,
    canEditCase: true,
    canDeleteCase: true,
    canMarkReadyForTest: false,
    canExecuteTest: true,
    canManageUsers: false,
    canExportUat: true,
    canViewAuditLogs: true,
  },
]

// --- API ------------------------------------------------------------------------
const users = () => load(STORAGE_KEYS.users, MOCK_USERS)

/** GET /users */
export const fetchUsers = () => respond(users)

/** POST /users */
export const createUser = (input: Omit<User, 'id'>) =>
  respond(() => {
    const user: User = { ...input, id: newId('user') }
    save(STORAGE_KEYS.users, [...users(), user])
    return user
  })

/** PATCH /users/:id */
export const updateUser = (id: string, patch: Partial<User>) =>
  respond(() => {
    const list = users()
    const user = list.find((u) => u.id === id)
    if (!user) throw new ApiError('ไม่พบผู้ใช้', 404)
    Object.assign(user, patch)
    save(STORAGE_KEYS.users, list)
    return user
  })

/** GET /roles/permissions */
export const fetchPermissions = () => respond(() => load(STORAGE_KEYS.permissions, DEFAULT_ROLE_PERMISSIONS))

/** PATCH /roles/:role/permissions */
export const updatePermission = (role: UserRole, patch: Partial<RolePermission>) =>
  respond(() => {
    const list = load(STORAGE_KEYS.permissions, DEFAULT_ROLE_PERMISSIONS)
    const perm = list.find((p) => p.role === role)
    if (!perm) throw new ApiError('ไม่พบ Role', 404)
    Object.assign(perm, patch, { role })
    save(STORAGE_KEYS.permissions, list)
    return perm
  })

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
