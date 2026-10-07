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
    /**
     * Who may open the page (checked on every matched record, parents first; the sidebar uses the same
     * rules, see Authorization.canOpen). Neither: open to every signed-in user.
     *   roles        a hard restriction: one of these roles (a role id or 'admin' = the built-in Admin),
     *                whatever permissions other roles have
     *   permissions  all of these permissions
     */
    roles?: string[]
    permissions?: PermissionKey[]
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
    meta: { title: 'Requirements', permissions: ['requirement.view'], api: ['requirement', 'test-case'] },
  },
  {
    path: '/test-cases',
    name: 'test-cases',
    component: () => import('@/views/test-cases/Index.vue'),
    meta: { title: 'Test Cases', permissions: ['case.view'], api: ['test-case'] },
  },
  {
    path: '/test-runs',
    name: 'test-runs',
    component: () => import('@/views/test-runs/Index.vue'),
    meta: { title: 'รอบการทดสอบ', permissions: ['run.view'], api: ['run', 'test-case'] },
  },
  {
    path: '/test-runs/:id',
    name: 'test-run-execute',
    component: () => import('@/views/test-runs/Execute.vue'),
    meta: { title: 'บันทึกผลการทดสอบ', permissions: ['run.view'], api: ['run', 'test-case'] },
  },
  {
    path: '/defects',
    name: 'defects',
    component: () => import('@/views/defects/Index.vue'),
    meta: { title: 'Defects', permissions: ['defect.view'], api: ['defect'] },
  },
  {
    path: '/calendar',
    name: 'calendar',
    // `aside` renders inside the right sidebar of DefaultLayout
    components: {
      default: () => import('@/views/calendar/Index.vue'),
      aside: () => import('@/components/calendar/CalendarAside.vue'),
    },
    meta: { title: 'ปฏิทินงานทดสอบ', permissions: ['calendar.view'], api: ['test-case'] },
  },
  {
    path: '/documents',
    name: 'documents',
    component: () => import('@/views/documents/Index.vue'),
    meta: { title: 'ศูนย์เอกสาร', permissions: ['document.view'], api: ['document'] },
  },
  {
    path: '/documents/:id',
    name: 'document-preview',
    component: () => import('@/views/documents/Preview.vue'),
    meta: { title: 'เอกสาร', permissions: ['document.view'], api: ['document'] },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('@/views/reports/Index.vue'),
    meta: { title: 'รายงานสรุปผลการทดสอบ', permissions: ['report.view'], api: ['report', 'test-case'] },
  },
  {
    path: '/audit-trail',
    name: 'audit-trail',
    component: () => import('@/views/audit-trail/Index.vue'),
    meta: { title: 'Audit Logs', permissions: ['audit.view'], api: ['audit'] },
  },
  {
    path: '/admin/users',
    name: 'users',
    component: () => import('@/views/users/Index.vue'),
    meta: { title: 'ผู้ใช้งาน', roles: ['admin'], api: ['user'] },
  },
  {
    path: '/admin/permissions',
    name: 'permissions',
    component: () => import('@/views/permissions/Index.vue'),
    meta: { title: 'Role และสิทธิ์', roles: ['admin'], api: ['role'] },
  },
  {
    path: '/admin/teams',
    name: 'teams',
    component: () => import('@/views/teams/Index.vue'),
    meta: { title: 'ทีม', roles: ['admin'], api: ['team'] },
  },
  {
    path: '/admin/backup',
    name: 'backup',
    component: () => import('@/views/backup/Index.vue'),
    meta: { title: 'สำรองข้อมูล', roles: ['admin'], api: ['backup', 'team'] },
  },
  {
    // universal search: every match, a page at a time (each group asks only for what the user may see)
    path: '/search',
    name: 'search',
    component: () => import('@/views/search/Index.vue'),
    meta: { title: 'ผลการค้นหา' },
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

// pages the user may not open redirect to the dashboard (the sidebar hides them too; this covers typed URLs)
router.beforeEach(async (to) => {
  if (to.meta.layout === 'blank') return true
  const app = useAppStore()
  await app.bootstrap()
  // no session (or it ended): sign in first
  if (app.signedOut) return { path: '/login' }
  // a module that isn't on yet (rest mode, the backend doesn't have it): its pages wait
  if (!apiAllOn(to.meta.api)) return { path: '/dashboard' }
  if (!app.ready) return true // start-up failed: the layout shows the error and a retry
  const auth = useAuthStore()
  if (auth.canOpen(to)) return true
  app.showError(new ApiError(`คุณไม่มีสิทธิ์เปิดหน้า ${to.meta.title ?? to.path} (${auth.roleOf(auth.currentUser).label})`, 403))
  return { path: '/dashboard' }
})

// forms with unsaved changes ask before the page (or a dialog form) is left
installLeaveGuard(router)

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · TestPulse` : 'TestPulse'
})

export default router
