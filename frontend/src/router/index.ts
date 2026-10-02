import { apiAllOn, type ApiModule } from '@/api'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { installLeaveGuard } from '@/composables/useUnsavedChanges'
import { useAppStore } from '@/stores/app.store'
import { useAuthStore } from '@/stores/auth.store'
import type { PermissionKey } from '@/types'
import { ApiError } from '@/api/errors'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** 'blank' = no drawer / app bar (e.g. login) */
    layout?: 'default' | 'blank'
    /** needed to open the page (same keys as the sidebar); pages without one are open to every signed-in user */
    permission?: PermissionKey
    /** built-in Admin role only (users, roles, teams) */
    adminOnly?: boolean
    /** API modules the page needs: off ones (rest mode, see apiOn) hide it from the menu and redirect */
    api?: ApiModule[]
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/dashboard/Index.vue'),
    meta: { title: 'ภาพรวมโปรเจกต์' },
  },
  {
    path: '/requirements',
    name: 'requirements',
    component: () => import('@/views/requirements/Index.vue'),
    meta: { title: 'Requirements', permission: 'requirement.view', api: ['requirement', 'test-case'] },
  },
  {
    path: '/test-cases',
    name: 'test-cases',
    component: () => import('@/views/test-cases/Index.vue'),
    meta: { title: 'Test Cases', permission: 'case.view', api: ['test-case'] },
  },
  {
    path: '/test-runs',
    name: 'test-runs',
    component: () => import('@/views/test-runs/Index.vue'),
    meta: { title: 'รอบการทดสอบ', permission: 'run.view', api: ['run', 'test-case'] },
  },
  {
    path: '/test-runs/:id',
    name: 'test-run-execute',
    component: () => import('@/views/test-runs/Execute.vue'),
    meta: { title: 'บันทึกผลการทดสอบ', permission: 'run.view', api: ['run', 'test-case'] },
  },
  {
    path: '/defects',
    name: 'defects',
    component: () => import('@/views/defects/Index.vue'),
    meta: { title: 'Defects', permission: 'defect.view', api: ['defect'] },
  },
  {
    path: '/calendar',
    name: 'calendar',
    // `aside` renders inside the right sidebar of DefaultLayout
    components: {
      default: () => import('@/views/calendar/Index.vue'),
      aside: () => import('@/components/calendar/CalendarAside.vue'),
    },
    meta: { title: 'ปฏิทินงานทดสอบ', permission: 'calendar.view', api: ['test-case'] },
  },
  {
    path: '/documents',
    name: 'documents',
    component: () => import('@/views/documents/Index.vue'),
    meta: { title: 'ศูนย์เอกสาร', permission: 'document.view', api: ['document'] },
  },
  {
    path: '/documents/:id',
    name: 'document-preview',
    component: () => import('@/views/documents/Preview.vue'),
    meta: { title: 'เอกสาร', permission: 'document.view', api: ['document'] },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('@/views/reports/Index.vue'),
    meta: { title: 'รายงาน', permission: 'report.view', api: ['test-case', 'run', 'defect'] },
  },
  {
    path: '/audit-trail',
    name: 'audit-trail',
    component: () => import('@/views/audit-trail/Index.vue'),
    meta: { title: 'Audit Logs', permission: 'audit.view', api: ['audit'] },
  },
  {
    path: '/admin/users',
    name: 'users',
    component: () => import('@/views/users/Index.vue'),
    meta: { title: 'ผู้ใช้งาน', adminOnly: true, api: ['user'] },
  },
  {
    path: '/admin/permissions',
    name: 'permissions',
    component: () => import('@/views/permissions/Index.vue'),
    meta: { title: 'Role และสิทธิ์', adminOnly: true, api: ['role'] },
  },
  {
    path: '/admin/teams',
    name: 'teams',
    component: () => import('@/views/teams/Index.vue'),
    meta: { title: 'ทีม', adminOnly: true, api: ['team'] },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/settings/Index.vue'),
    meta: { title: 'ตั้งค่า' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/Login.vue'),
    meta: { title: 'เข้าสู่ระบบ', layout: 'blank' },
  },
  {
    path: '/invite/:token',
    name: 'invite',
    component: () => import('@/views/auth/Invite.vue'),
    meta: { title: 'ตั้งรหัสผ่าน', layout: 'blank' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/auth/Register.vue'),
    meta: { title: 'สมัครสมาชิก', layout: 'blank' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// pages the role may not open redirect to the dashboard (the sidebar hides them too; this covers typed URLs)
router.beforeEach(async (to) => {
  if (to.meta.layout === 'blank') return true
  const app = useAppStore()
  await app.bootstrap()
  // no session (or it ended): sign in first
  if (app.signedOut) return { path: '/login' }
  // a module that isn't on yet (rest mode, the backend doesn't have it): its pages wait
  if (!apiAllOn(to.meta.api)) return { path: '/dashboard' }
  if (!to.meta.permission && !to.meta.adminOnly) return true
  if (!app.ready) return true // start-up failed: the layout shows the error and a retry
  const auth = useAuthStore()
  const allowed = to.meta.adminOnly ? auth.isAdmin : auth.can(to.meta.permission!)
  if (allowed) return true
  app.showError(new ApiError(`คุณไม่มีสิทธิ์เปิดหน้า ${to.meta.title ?? to.path} (${auth.roleOf(auth.currentUser).label})`, 403))
  return { path: '/dashboard' }
})

// forms with unsaved changes ask before the page (or a dialog form) is left
installLeaveGuard(router)

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · TestPulse` : 'TestPulse'
})

export default router
