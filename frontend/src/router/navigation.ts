import type { NavItem } from '@/types'

// Sidebar menu, grouped by the QA workflow. Who sees an item is the rule of the page it opens (`meta.roles` /
// `meta.permissions` in router/index.ts), so menu and guard never disagree. A section header shows only when
// an item under it does.
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
  { header: 'ผู้ดูแลระบบ' },
  { title: 'Audit Logs', icon: 'tabler:history', to: '/audit-trail' },
  { title: 'ผู้ใช้งาน', icon: 'tabler:users', to: '/admin/users' },
  { title: 'Role และสิทธิ์', icon: 'tabler:shield-lock', to: '/admin/permissions' },
  { title: 'ทีม', icon: 'tabler:users-group', to: '/admin/teams' },
  { title: 'สำรองข้อมูล', icon: 'tabler:database-export', to: '/admin/backup' },
  { header: 'ระบบ' },
  { title: 'ตั้งค่า', icon: 'tabler:settings', to: '/settings' },
]

export default navigation
