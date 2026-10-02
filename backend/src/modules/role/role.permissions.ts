import type { PermissionKey, Role } from '#contract/types.js'

// The permission keys a role can hold (labels and grouping are the web app's: PERMISSION_GROUPS).
// `satisfies` + the exhaustive check below keep this list equal to the contract's PermissionKey.
export const ALL_PERMISSIONS = [
  'requirement.view',
  'requirement.edit',
  'requirement.delete',
  'case.view',
  'case.edit',
  'case.archive',
  'case.delete',
  'case.reorder',
  'case.restoreVersion',
  'case.handoff',
  'run.view',
  'run.create',
  'run.execute',
  'run.close',
  'defect.view',
  'defect.report',
  'defect.resolve',
  'calendar.view',
  'document.view',
  'document.create',
  'document.sign',
  'report.view',
  'notification.receive',
  'audit.view',
] as const satisfies readonly PermissionKey[]

type Missing = Exclude<PermissionKey, (typeof ALL_PERMISSIONS)[number]>
// fails to compile when the contract gains a permission this list doesn't have
const _exhaustive: Missing extends never ? true : Missing = true
void _exhaustive

export const isPermissionKey = (key: string): key is PermissionKey => (ALL_PERMISSIONS as readonly string[]).includes(key)

export const ADMIN_ROLE_ID = 'role-admin'

/** the one built-in Admin role (recreated at start-up if missing) */
export const ADMIN_ROLE: Omit<Role, 'createdAt' | 'updatedAt'> = {
  id: ADMIN_ROLE_ID,
  name: 'Admin',
  description: 'ผู้ดูแลระบบ ทำได้ทุกอย่าง และเป็น Role เดียวที่จัดการผู้ใช้ Role ทีม และโปรเจกต์ได้',
  discipline: 'other',
  tone: 'primary',
  icon: 'tabler:user-shield',
  permissions: [...ALL_PERMISSIONS],
  builtIn: 'admin',
}
