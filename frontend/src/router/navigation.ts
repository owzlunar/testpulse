import type { NavItem } from '@/types'

// Sidebar menu, grouped by the QA workflow. `permission` hides an item (or a section header) from roles without it;
// `adminOnly` items belong to the built-in Admin role. Items without either are open to everyone (dashboard, settings).
// A section header shows only when an item under it does. Routes carry the same rules (router/index.ts).
const navigation: NavItem[] = [
  { header: 'หน้าหลัก' },
  { title: 'ภาพรวมโปรเจกต์', icon: 'tabler:layout-dashboard', to: '/dashboard' },
  { header: 'การทดสอบ' },
  { title: 'Requirements', icon: 'tabler:clipboard-list', to: '/requirements', permission: 'requirement.view' },
  { title: 'Test Cases', icon: 'tabler:flask', to: '/test-cases', permission: 'case.view' },
  { title: 'รอบการทดสอบ', icon: 'tabler:player-play', to: '/test-runs', permission: 'run.view' },
  { title: 'Defects', icon: 'tabler:bug', to: '/defects', permission: 'defect.view' },
  { title: 'ปฏิทินงานทดสอบ', icon: 'tabler:calendar-event', to: '/calendar', permission: 'calendar.view' },
  { header: 'เอกสารและรายงาน' },
  { title: 'ศูนย์เอกสาร', icon: 'tabler:files', to: '/documents', permission: 'document.view' },
  { title: 'รายงาน', icon: 'tabler:report-analytics', to: '/reports', permission: 'report.view' },
  { header: 'ผู้ดูแลระบบ' },
  { title: 'Audit Logs', icon: 'tabler:history', to: '/audit-trail', permission: 'audit.view' },
  { title: 'ผู้ใช้งาน', icon: 'tabler:users', to: '/admin/users', adminOnly: true },
  { title: 'Role และสิทธิ์', icon: 'tabler:shield-lock', to: '/admin/permissions', adminOnly: true },
  { title: 'ทีม', icon: 'tabler:users-group', to: '/admin/teams', adminOnly: true },
  { header: 'ระบบ' },
  { title: 'ตั้งค่า', icon: 'tabler:settings', to: '/settings' },
]

export default navigation
