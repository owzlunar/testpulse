import type { NavItem } from '@/types'

// Sidebar menu, grouped by the QA workflow. `permission` hides an item (or a section header) from roles without it;
// `adminOnly` items belong to the built-in Admin role. Items without either are open to everyone (dashboard, settings).
const navigation: NavItem[] = [
  { header: 'หน้าหลัก' },
  { title: 'ภาพรวมโปรเจกต์', icon: 'tabler:layout-dashboard', to: '/dashboard' },
  { header: 'การทดสอบ' },
  { title: 'Requirements', icon: 'tabler:clipboard-list', to: '/requirements' },
  { title: 'Test Cases', icon: 'tabler:flask', to: '/test-cases' },
  { title: 'รอบการทดสอบ', icon: 'tabler:player-play', to: '/test-runs' },
  { title: 'Defects', icon: 'tabler:bug', to: '/defects' },
  { title: 'ปฏิทินงานทดสอบ', icon: 'tabler:calendar-event', to: '/calendar' },
  { header: 'เอกสารและรายงาน' },
  { title: 'ศูนย์เอกสาร', icon: 'tabler:files', to: '/documents' },
  { title: 'รายงาน', icon: 'tabler:report-analytics', to: '/reports' },
  { header: 'ผู้ดูแลระบบ', permission: 'audit.view' },
  { title: 'Audit Logs', icon: 'tabler:history', to: '/audit-trail', permission: 'audit.view' },
  { title: 'ผู้ใช้งาน', icon: 'tabler:users', to: '/admin/users', adminOnly: true },
  { title: 'Role และสิทธิ์', icon: 'tabler:shield-lock', to: '/admin/permissions', adminOnly: true },
  { header: 'ระบบ' },
  { title: 'ตั้งค่า', icon: 'tabler:settings', to: '/settings' },
]

export default navigation
