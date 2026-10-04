import type { MilestoneType, Option, ProjectStatus } from '@/types'

// Rules the backend shares (the project key) live in ./rules/project.ts
export * from './rules/project'

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

export const milestoneTypeOf = (type: MilestoneType): Option<MilestoneType> => MILESTONE_TYPES.find((m) => m.value === type) ?? MILESTONE_TYPES[0]

export { caseStatsOf } from './rules/test-case'
