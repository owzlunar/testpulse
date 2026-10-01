import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    /** 'blank' = no drawer / app bar (e.g. login) */
    layout?: 'default' | 'blank'
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
    meta: { title: 'Requirements' },
  },
  {
    path: '/test-cases',
    name: 'test-cases',
    component: () => import('@/views/test-cases/Index.vue'),
    meta: { title: 'Test Cases' },
  },
  {
    path: '/test-runs',
    name: 'test-runs',
    component: () => import('@/views/test-runs/Index.vue'),
    meta: { title: 'รอบการทดสอบ' },
  },
  {
    path: '/test-runs/:id',
    name: 'test-run-execute',
    component: () => import('@/views/test-runs/Execute.vue'),
    meta: { title: 'บันทึกผลการทดสอบ' },
  },
  {
    path: '/defects',
    name: 'defects',
    component: () => import('@/views/defects/Index.vue'),
    meta: { title: 'Defects' },
  },
  {
    path: '/calendar',
    name: 'calendar',
    // `aside` renders inside the right sidebar of DefaultLayout
    components: {
      default: () => import('@/views/calendar/Index.vue'),
      aside: () => import('@/components/calendar/CalendarAside.vue'),
    },
    meta: { title: 'ปฏิทินงานทดสอบ' },
  },
  {
    path: '/documents',
    name: 'documents',
    component: () => import('@/views/documents/Index.vue'),
    meta: { title: 'ศูนย์เอกสาร' },
  },
  {
    path: '/documents/:id',
    name: 'document-preview',
    component: () => import('@/views/documents/Preview.vue'),
    meta: { title: 'เอกสาร' },
  },
  {
    path: '/reports',
    name: 'reports',
    component: () => import('@/views/reports/Index.vue'),
    meta: { title: 'รายงาน' },
  },
  {
    path: '/audit-trail',
    name: 'audit-trail',
    component: () => import('@/views/audit-trail/Index.vue'),
    meta: { title: 'Audit Logs' },
  },
  {
    path: '/admin/users',
    name: 'users',
    component: () => import('@/views/users/Index.vue'),
    meta: { title: 'ผู้ใช้งาน' },
  },
  {
    path: '/admin/permissions',
    name: 'permissions',
    component: () => import('@/views/permissions/Index.vue'),
    meta: { title: 'สิทธิ์การใช้งาน' },
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

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · TestPulse` : 'TestPulse'
})

export default router
