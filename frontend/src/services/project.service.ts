import type { MilestoneType, Option, Project, ProjectInput, ProjectStatus, User } from '@/types'
import { ApiError, newId, respond } from './http'
import { roleById } from './role.service'
import { teams } from './team.service'
import { sessionUser } from './user.service'
import { STORAGE_KEYS, load, save, update } from './storage.service'

export const PROJECT_STATUSES: Option<ProjectStatus>[] = [
  { value: 'active', label: 'Active', hint: 'กำลังดำเนินการ', tone: 'success', icon: 'tabler:player-play' },
  { value: 'in_review', label: 'In Review', hint: 'รอตรวจสอบ', tone: 'warning', icon: 'tabler:hourglass' },
  { value: 'completed', label: 'Completed', hint: 'เสร็จสิ้น', tone: 'primary', icon: 'tabler:circle-check' },
  { value: 'archived', label: 'Archived', hint: 'เก็บถาวร', tone: 'secondary', icon: 'tabler:archive' },
]

export const projectStatusOf = (status: ProjectStatus): Option<ProjectStatus> =>
  PROJECT_STATUSES.find((s) => s.value === status) ?? PROJECT_STATUSES[0]

export const MILESTONE_TYPES: Option<MilestoneType>[] = [
  { value: 'code_freeze', label: 'Code Freeze', hint: 'หยุดรับฟีเจอร์ใหม่', tone: 'info', icon: 'tabler:snowflake' },
  { value: 'uat_signoff', label: 'UAT Sign-off', hint: 'ตรวจรับระบบ', tone: 'caution', icon: 'tabler:certificate' },
  { value: 'go_live', label: 'Go-Live', hint: 'ขึ้น Production', tone: 'success', icon: 'tabler:rocket' },
]

export const milestoneTypeOf = (type: MilestoneType): Option<MilestoneType> =>
  MILESTONE_TYPES.find((m) => m.value === type) ?? MILESTONE_TYPES[0]

const SEED_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    key: 'PAY',
    name: 'PromptPay & QR Payment Gateway v3',
    description: 'ระบบชำระเงินผ่าน PromptPay QR และ Credit Card Gateway รองรับธุรกรรม 5,000 TPS และ webhook reconciliation',
    logo: '/images/projects/promptpay-logo.jpg',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-29T10:30:00Z',
    targetDeadline: '2026-10-15',
    status: 'active',
    tags: ['FinTech', 'High-Risk', 'Backend-API', 'PCI-DSS'],
    memberCount: 5,
    teamIds: ['team-payment'],
    milestones: [
      { id: 'm-1', title: 'Sprint 42 Code Freeze', date: '2026-10-02', type: 'code_freeze', description: 'หยุดรับฟีเจอร์ใหม่ มุ่งเน้นแก้ Bug และ Re-test' },
      { id: 'm-2', title: 'UAT Sign-off Deadline', date: '2026-10-15', type: 'uat_signoff', description: 'กำหนดการตรวจรับระบบร่วมกับธนาคารและ Merchant' },
      { id: 'm-3', title: 'Production Go-Live', date: '2026-10-25', type: 'go_live', description: 'Deploy ระบบขึ้น Production Cluster' },
    ],
  },
  {
    id: 'proj-2',
    key: 'SHOP',
    name: 'Omnichannel SuperApp E-Commerce',
    description: 'แอปพลิเคชันซื้อสินค้าออนไลน์ ครอบคลุมระบบ Shopping Cart, Flash Sale, Point Redemption และ Delivery Tracking',
    createdAt: '2026-09-10T09:00:00Z',
    updatedAt: '2026-09-30T04:15:00Z',
    targetDeadline: '2026-10-05',
    status: 'active',
    tags: ['Mobile-App', 'iOS/Android', 'E-Commerce', 'FlashSale'],
    memberCount: 8,
    teamIds: ['team-ecommerce'],
  },
  {
    id: 'proj-3',
    key: 'AUTH',
    name: 'Enterprise SSO & IAM Platform',
    description: 'ระบบ Identity and Access Management สำหรับพนักงานองค์กร รองรับ OAuth2/OIDC, Multi-factor Authentication (FIDO2) และ RBAC',
    createdAt: '2026-08-15T11:00:00Z',
    updatedAt: '2026-09-28T09:00:00Z',
    targetDeadline: '2026-11-01',
    status: 'in_review',
    tags: ['Security', 'OAuth2', '2FA', 'Audit'],
    memberCount: 4,
  },
]

// --- API ------------------------------------------------------------------------
/** re-applies demo fields that older saved data may be missing */
function projects(): Project[] {
  const list = load(STORAGE_KEYS.projects, SEED_PROJECTS)
  const seed = SEED_PROJECTS[0]
  const demo = list.find((p) => p.id === seed.id)
  if (demo && (demo.logo !== seed.logo || !demo.milestones?.length)) {
    demo.logo = seed.logo
    demo.milestones = demo.milestones?.length ? demo.milestones : seed.milestones
    save(STORAGE_KEYS.projects, list)
  }
  return list
}

/**
 * server-side: may this user open the project? Admins always; otherwise the user needs a role, and
 * a project with teams is open only to their members (a project without teams is open to every role).
 */
export function canAccessProject(user: User | null, project: Pick<Project, 'teamIds'>): boolean {
  const role = roleById(user?.roleId)
  if (!user || !role) return false
  if (role.builtIn === 'admin' || !project.teamIds?.length) return true
  return teams().some((t) => project.teamIds!.includes(t.id) && t.memberIds.includes(user.id))
}

/** server-side: ids of the projects the signed-in user may open (every list endpoint filters by it) */
export function accessibleProjectIds(): Set<string> {
  const user = sessionUser()
  return new Set(projects().filter((p) => canAccessProject(user, p)).map((p) => p.id))
}

/** server-side: keep the records that belong to projects the signed-in user may open (no project = global) */
export function inAccessibleProjects<T extends { projectId?: string }>(list: T[]): T[] {
  const ids = accessibleProjectIds()
  return list.filter((x) => !x.projectId || ids.has(x.projectId))
}

/** GET /projects (only the ones the signed-in user may open) */
export const fetchProjects = () =>
  respond(() => {
    const user = sessionUser()
    return projects().filter((p) => canAccessProject(user, p))
  })

/** POST /projects */
export const createProject = (input: ProjectInput) =>
  respond(() => {
    const now = new Date().toISOString()
    const project: Project = { ...input, id: newId('proj'), createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.projects, [project, ...projects()])
    return project
  })

/** PUT /projects/:id */
export const updateProject = (id: string, input: ProjectInput) =>
  respond(() => {
    const list = projects()
    const i = list.findIndex((p) => p.id === id)
    if (i < 0) throw new ApiError('ไม่พบโปรเจกต์', 404)
    list[i] = { ...list[i], ...input, id, updatedAt: new Date().toISOString() }
    save(STORAGE_KEYS.projects, list)
    return list[i]
  })

/** DELETE /projects/:id (the server also removes the project's test cases) */
export const deleteProject = (id: string) =>
  respond(() => {
    save(STORAGE_KEYS.projects, projects().filter((p) => p.id !== id))
    update(STORAGE_KEYS.testCases, [] as { projectId: string }[], (cases) => cases.filter((c) => c.projectId !== id))
  })

/** last project the user worked on (client preference, not an API call) */
export const loadSelectedProjectId = (): string | null => localStorage.getItem(STORAGE_KEYS.selectedProjectId)
export const saveSelectedProjectId = (id: string) => localStorage.setItem(STORAGE_KEYS.selectedProjectId, id)
