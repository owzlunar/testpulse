import type { Option, TestCasePriority, TestCaseStatus, Tone } from '@/types'

// Rules the backend shares (versions, spec changes, SLA, stats) live in ./rules/test-case.ts
export * from './rules/test-case'

// Dev <-> QA lifecycle: Pending Dev -> Ready for Test -> (QA) -> Passed | Failed -> back to Dev
export const STATUSES: Option<TestCaseStatus>[] = [
  { value: 'pending', label: 'Pending Dev', hint: 'รอ Dev พัฒนา', tone: 'primary', icon: 'tabler:code' },
  { value: 'ready_for_test', label: 'Ready for Test', hint: 'พร้อมให้ QA ทดสอบ', tone: 'info', icon: 'tabler:send' },
  { value: 'untested', label: 'Untested', hint: 'ยังไม่ได้ทดสอบ', tone: 'secondary', icon: 'tabler:circle-dashed' },
  { value: 'in_progress', label: 'In Progress', hint: 'กำลังทดสอบ', tone: 'warning', icon: 'tabler:progress' },
  { value: 'passed', label: 'Passed', hint: 'ผ่านการทดสอบ', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'failed', label: 'Failed', hint: 'ไม่ผ่าน / พบ Bug', tone: 'error', icon: 'tabler:circle-x' },
  { value: 'blocked', label: 'Blocked', hint: 'ติดปัญหาภายนอก', tone: 'caution', icon: 'tabler:ban' },
]

export const statusOf = (status: TestCaseStatus): Option<TestCaseStatus> => STATUSES.find((s) => s.value === status) ?? STATUSES[2]

/** QA verdicts (need canExecuteTest) */
export const EXECUTION_STATUSES: TestCaseStatus[] = ['in_progress', 'passed', 'failed', 'blocked', 'untested']

export const PRIORITIES: Option<TestCasePriority>[] = [
  { value: 'critical', label: 'Critical', hint: 'วิกฤต', tone: 'error', icon: 'tabler:flame' },
  { value: 'high', label: 'High', hint: 'สูง', tone: 'caution', icon: 'tabler:chevrons-up' },
  { value: 'medium', label: 'Medium', hint: 'ปานกลาง', tone: 'info', icon: 'tabler:equal' },
  { value: 'low', label: 'Low', hint: 'ต่ำ', tone: 'secondary', icon: 'tabler:chevron-down' },
]

export const priorityOf = (priority: TestCasePriority): Option<TestCasePriority> => PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[2]

export const ROOT_CAUSES: string[] = [
  'Race Condition',
  'Spec Gap',
  'External API Timeout',
  'Environment Downtime',
  'Data Validation Bug',
  'Concurrency Lock',
  'UI Rendering Glitch',
]

export const EXTEND_REASONS: string[] = [
  'Requirement เปลี่ยนแปลง (Spec Change)',
  'Third-party API / Sandbox ล่าช้า (External API Delay)',
  'Bug ซับซ้อน ต้อง Refactor (Complex Bug)',
  'สภาพแวดล้อมทดสอบขัดข้อง (Env Issue)',
  'รอข้อมูลทดสอบจากผู้ใช้จริง (Waiting for Test Data)',
  'ทรัพยากรไม่พอ / มีงานด่วนแทรก (Resource Constraint)',
  'อื่นๆ (Other)',
]

/** Where the case is waiting right now (Bottleneck "Current Dwell") */
export function dwellOf(status: TestCaseStatus): { label: string; tone: Tone; icon: string } {
  switch (status) {
    case 'pending':
      return { label: 'ทีม Dev กำลังพัฒนา', tone: 'primary', icon: 'tabler:code' }
    case 'ready_for_test':
    case 'untested':
    case 'in_progress':
      return { label: 'รอ QA ตรวจสอบ', tone: 'info', icon: 'tabler:shield-check' }
    case 'failed':
      return { label: 'ติด Bug รอ Dev แก้', tone: 'error', icon: 'tabler:bug' }
    case 'blocked':
      return { label: 'ติดปัญหาภายนอก', tone: 'caution', icon: 'tabler:ban' }
    default:
      return { label: 'เสร็จสิ้น', tone: 'success', icon: 'tabler:circle-check' }
  }
}
