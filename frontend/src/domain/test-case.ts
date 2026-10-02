import type { Option, Requirement, TestCase, TestCasePriority, TestCaseSpec, TestCaseStatus, Tone } from '@/types'
import { requirementsForCase } from '@/domain/requirement'
import { daysFromToday } from '@/utils/date'

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

// --- SLA helpers ---------------------------------------------------------------
/** Passed cases never count as overdue */
export const isOverdue = (tc: TestCase): boolean => !!tc.expiryDate && tc.status !== 'passed' && daysFromToday(tc.expiryDate) < 0

export const overdueDays = (tc: TestCase): number => (isOverdue(tc) ? -daysFromToday(tc.expiryDate) : 0)

export const isDueSoon = (tc: TestCase, days = 3): boolean => {
  if (!tc.expiryDate || tc.status === 'passed') return false
  const left = daysFromToday(tc.expiryDate)
  return left >= 0 && left <= days
}

/** Ping-pong: bounced between Failed and Ready for Test more than once */
export const isHighChurn = (tc: TestCase): boolean => (tc.churnCount ?? 0) > 1

/** fields that define what is tested; changing any of them makes a new version */
const SPEC_FIELDS = [
  'name',
  'requirement',
  'requirementIds',
  'testScenario',
  'description',
  'prerequisite',
  'steps',
  'expectedResults',
  'expectedImages',
] as const satisfies readonly (keyof TestCase)[]

/** comparable form of a spec field: steps by text and order, empty lists equal to missing */
function specValue(tc: Partial<TestCase>, field: (typeof SPEC_FIELDS)[number]): string {
  const value =
    field === 'steps'
      ? tc.steps?.map((s) => [s.action.trim(), s.testData.trim(), s.expectedResult.trim()]).filter((s) => s.some(Boolean))
      : typeof tc[field] === 'string'
        ? (tc[field] as string).trim()
        : tc[field]
  return JSON.stringify(Array.isArray(value) && !value.length ? null : (value ?? null))
}

/**
 * Did the spec (what is tested) change? Status, due date, assignees and priority don't count:
 * they are tracked in the audit trail, not as versions.
 * Pass the requirements so a legacy case (linked by its text) compares with its effective links:
 * saving those links explicitly is not a change.
 */
export function hasSpecChanges(old: TestCase, next: Partial<TestCase>, requirements: Requirement[] = []): boolean {
  const base = old.requirementIds?.length ? old : { ...old, requirementIds: requirementsForCase(old, requirements).map((r) => r.id) }
  return SPEC_FIELDS.some((f) => f in next && specValue(base, f) !== specValue(next, f))
}

/** spec fields shown when comparing versions (requirement links shown together with the requirement text) */
export const SPEC_FIELD_LABELS: { field: keyof TestCaseSpec; label: string }[] = [
  { field: 'name', label: 'ชื่อ Test Case' },
  { field: 'requirement', label: 'Requirement' },
  { field: 'testScenario', label: 'Test Scenario' },
  { field: 'prerequisite', label: 'Prerequisite' },
  { field: 'description', label: 'คำอธิบายเพิ่มเติม' },
  { field: 'steps', label: 'ขั้นตอน' },
  { field: 'expectedResults', label: 'ผลลัพธ์ที่คาดหวัง' },
]

/** the spec part of a case, as stored in a version snapshot */
export const specOf = (tc: TestCaseSpec): TestCaseSpec => ({
  name: tc.name,
  requirement: tc.requirement,
  requirementIds: [...(tc.requirementIds ?? [])],
  testScenario: tc.testScenario,
  description: tc.description,
  prerequisite: tc.prerequisite,
  steps: tc.steps.map((s) => ({ ...s })),
  expectedResults: tc.expectedResults,
})

/** a spec whose requirement links are explicit: legacy text-linked specs get the links their text resolves to */
export function withEffectiveLinks(spec: TestCaseSpec, projectId: string, requirements: Requirement[]): TestCaseSpec {
  if (spec.requirementIds?.length || !requirements.length) return spec
  const ids = requirementsForCase({ ...spec, projectId } as TestCase, requirements).map((r) => r.id)
  return { ...spec, requirementIds: ids }
}

/**
 * Fields (of SPEC_FIELD_LABELS) that differ between two specs; requirement covers the links too.
 * Pass the project's requirements so text-linked and explicitly linked specs compare by their effective links.
 */
export function specDiff(a: TestCaseSpec, b: TestCaseSpec, projectId = '', requirements: Requirement[] = []): (keyof TestCaseSpec)[] {
  const [x, y] = [withEffectiveLinks(a, projectId, requirements), withEffectiveLinks(b, projectId, requirements)]
  const differs = (f: (typeof SPEC_FIELDS)[number]) => specValue(x as Partial<TestCase>, f) !== specValue(y as Partial<TestCase>, f)
  return SPEC_FIELD_LABELS.map((l) => l.field).filter((f) => differs(f) || (f === 'requirement' && differs('requirementIds')))
}

/** v1.0 -> v1.1, or v2.0 when `major` */
export function nextVersion(current = 'v1.0', major = false): string {
  const [maj = 1, min = 0] = current
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  return major ? `v${maj + 1}.0` : `v${maj || 1}.${min + 1}`
}
