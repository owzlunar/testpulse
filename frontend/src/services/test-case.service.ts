import type {
  ActiveUserPresence, Actor, Option, Requirement, TestCase, TestCaseImpact, TestCaseInput, TestCaseOrder, TestCaseSpec, TestCasePriority, TestCaseReorderResult,
  TestCaseStatus, TestCaseUpdateResult, TestCaseVersionRecord, Tone,
} from '@/types'
import { daysFromToday } from '@/utils/date'
import { detachAuditCases, renameAuditCases } from './audit.service'
import { defectsOf, detachDefectCases, isOpenDefect, renameDefectCases } from './defect.service'
import { ApiError, respond } from './http'
import { detachNotificationCases, renameNotificationCases } from './notification.service'
import { casesForRequirement, requirementsForCase, requirementsOf } from './requirement.service'
import { detachRunCases, renameRunCases, runsOf } from './run.service'
import { STORAGE_KEYS, load, migrateOnce, save } from './storage.service'

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

export const statusOf = (status: TestCaseStatus): Option<TestCaseStatus> =>
  STATUSES.find((s) => s.value === status) ?? STATUSES[2]

/** QA verdicts (need canExecuteTest) */
export const EXECUTION_STATUSES: TestCaseStatus[] = ['in_progress', 'passed', 'failed', 'blocked', 'untested']

export const PRIORITIES: Option<TestCasePriority>[] = [
  { value: 'critical', label: 'Critical', hint: 'วิกฤต', tone: 'error', icon: 'tabler:flame' },
  { value: 'high', label: 'High', hint: 'สูง', tone: 'caution', icon: 'tabler:chevrons-up' },
  { value: 'medium', label: 'Medium', hint: 'ปานกลาง', tone: 'info', icon: 'tabler:equal' },
  { value: 'low', label: 'Low', hint: 'ต่ำ', tone: 'secondary', icon: 'tabler:chevron-down' },
]

export const priorityOf = (priority: TestCasePriority): Option<TestCasePriority> =>
  PRIORITIES.find((p) => p.value === priority) ?? PRIORITIES[2]

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
export const isOverdue = (tc: TestCase): boolean =>
  !!tc.expiryDate && tc.status !== 'passed' && daysFromToday(tc.expiryDate) < 0

export const overdueDays = (tc: TestCase): number => (isOverdue(tc) ? -daysFromToday(tc.expiryDate) : 0)

export const isDueSoon = (tc: TestCase, days = 3): boolean => {
  if (!tc.expiryDate || tc.status === 'passed') return false
  const left = daysFromToday(tc.expiryDate)
  return left >= 0 && left <= days
}

/** Ping-pong: bounced between Failed and Ready for Test more than once */
export const isHighChurn = (tc: TestCase): boolean => (tc.churnCount ?? 0) > 1

/** fields that define what is tested; changing any of them makes a new version */
const SPEC_FIELDS = ['name', 'requirement', 'requirementIds', 'testScenario', 'description', 'prerequisite', 'steps', 'expectedResults', 'expectedImages'] as const satisfies readonly (keyof TestCase)[]

/** comparable form of a spec field: steps by text and order, empty lists equal to missing */
function specValue(tc: Partial<TestCase>, field: (typeof SPEC_FIELDS)[number]): string {
  const value =
    field === 'steps'
      ? tc.steps?.map((s) => [s.action.trim(), s.testData.trim(), s.expectedResult.trim()]).filter((s) => s.some(Boolean))
      : typeof tc[field] === 'string' ? (tc[field] as string).trim() : tc[field]
  return JSON.stringify(Array.isArray(value) && !value.length ? null : value ?? null)
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
function withEffectiveLinks(spec: TestCaseSpec, projectId: string, requirements: Requirement[]): TestCaseSpec {
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
  const [maj = 1, min = 0] = current.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  return major ? `v${maj + 1}.0` : `v${maj || 1}.${min + 1}`
}

const presenceOf = (actor: Actor): ActiveUserPresence => ({ ...actor, action: 'editing' })

/**
 * server-side rules for changing a case:
 * - a version is a change to what is tested (hasSpecChanges) or an asked-for major bump;
 *   status / due date / assignee changes stay in the audit trail
 * - a pass only proves the spec it ran against: changing the spec of a passed case sends it back to ready_for_test
 * - every bounce between Dev and QA counts as one churn round
 * - id, project and parent can't be changed by a patch
 */
export function applyCasePatch(old: TestCase, patch: Partial<TestCaseInput>, actor: Actor): TestCaseUpdateResult {
  const now = new Date().toISOString()
  const { changeSummary, bumpMajor, ...updates } = patch
  const specChanged = hasSpecChanges(old, updates, requirementsOf(old.projectId))
  const passInvalidated = specChanged && old.status === 'passed' && (updates.status ?? old.status) === 'passed'
  const status = passInvalidated ? 'ready_for_test' : updates.status ?? old.status
  const version =
    updates.version && updates.version !== old.version ? updates.version
    : specChanged || bumpMajor ? nextVersion(old.version, bumpMajor)
    : old.version
  const newVersion = version !== old.version
  const record: TestCaseVersionRecord = {
    version,
    updatedBy: actor.name,
    timestamp: now,
    changeSummary: (changeSummary || 'แก้ไขข้อกำหนดหรือขั้นตอน') + (passInvalidated ? ` (ผลผ่านของ ${old.version} ถูกยกเลิก ต้องทดสอบใหม่)` : ''),
    status,
    snapshot: specOf({ ...old, ...updates }),
  }
  const bounced =
    (old.status === 'failed' && status === 'ready_for_test') ||
    (old.status === 'ready_for_test' && status === 'failed') ||
    (old.status === 'pending' && status === 'ready_for_test')

  const testCase: TestCase = {
    ...old,
    ...updates,
    id: old.id,
    projectId: old.projectId,
    parentId: old.parentId,
    numericId: old.numericId,
    status,
    churnCount: (old.churnCount ?? 0) + (bounced ? 1 : 0),
    version,
    versionHistory: newVersion ? [...(old.versionHistory ?? []), record] : old.versionHistory,
    activeUser: presenceOf(actor),
    createdAt: old.createdAt,
    updatedAt: now,
  }
  return { testCase, before: old, statusChanged: status !== old.status, newVersion, passInvalidated }
}

const SEED_TEST_CASES: TestCase[] = [
  {
    id: 'TC-101',
    numericId: 101,
    parentId: null,
    projectId: 'proj-1',
    requirement: 'REQ-PAY-01: ผู้ใช้สามารถสร้าง Dynamic PromptPay QR Code สำหรับชำระเงินตามยอดเงินที่ระบุได้',
    testScenario: 'ทดสอบการสร้างและสแกน Dynamic PromptPay QR Code ด้วยยอดเงินถูกต้อง',
    name: 'สร้าง Dynamic PromptPay QR Code และยืนยันการชำระเงินสำเร็จ',
    description: 'ตรวจสอบว่าเมื่อลูกค้ากดยืนยันชำระเงินด้วย PromptPay ระบบสามารถ Generate QR Code พร้อม Transaction Reference และเมื่อธนาคารส่ง Webhook กลับมา ระบบจะเปลี่ยนสถานะเป็น Paid ทันที',
    prerequisite: '1. บัญชี Merchant เปิดใช้งาน PromptPay API แล้ว\n2. Mock Bank Gateway เชื่อมต่อและพร้อมตอบกลับ Webhook Callback',
    steps: [
      {
        id: 's-1',
        stepNumber: 1,
        action: 'ส่ง API Request POST /v1/payments/qr-code พร้อม payload amount: 1500.00 THB',
        testData: '{"amount": 1500.00, "currency": "THB", "orderId": "ORD-99881"}',
        expectedResult: 'API ตอบกลับ HTTP 201 พร้อม raw QR payload และ expiration 15 minutes',
      },
      {
        id: 's-2',
        stepNumber: 2,
        action: 'สแกน QR Code ด้วย Sandbox Mobile Banking App และกดยืนยันโอนเงิน',
        testData: 'Pin: 123456, Source Account: 098-XXX-1234',
        expectedResult: 'App ธนาคารแสดงยอดเงิน 1,500.00 บาท และชื่อร้านค้าถูกต้อง',
      },
      {
        id: 's-3',
        stepNumber: 3,
        action: 'ตรวจสอบ Webhook Notification จาก Bank เข้าสู่ระบบ TestPulse Callback Receiver',
        testData: 'Webhook event: payment.success, txRef: TX-20260930-001',
        expectedResult: 'สถานะ Order เปลี่ยนเป็น PAID และส่ง Notification Push ถึงผู้ซื้อภายใน 2 วินาที',
      },
    ],
    expectedResults: 'QR Code ถูกสร้างขึ้นอย่างถูกต้องตามมาตรฐาน EMVCo, เมื่อชำระเงินแล้วสถานะเปลี่ยนเป็น PAID ทันที และมี Receipt ส่งเข้าอีเมล',
    expectedImages: [
      'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=500&auto=format&fit=crop&q=80'
    ],
    actualResults: 'ระบบทำงานได้สมบูรณ์ตามเกณฑ์ ทุกขั้นตอนผ่านฉลุย Response Time เฉลี่ย 230ms',
    actualImages: [
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=500&auto=format&fit=crop&q=80'
    ],
    status: 'passed',
    priority: 'critical',
    expiryDate: '2026-10-10',
    assignedTo: 'Somchai Prasert',
    executedBy: 'Somchai Prasert',
    executedAt: '2026-09-30T10:15:00Z',
    version: 'v1.2',
    versionHistory: [
      {
        version: 'v1.0',
        updatedBy: 'Somchai Prasert',
        timestamp: '2026-09-20T08:00:00Z',
        changeSummary: 'สร้าง Initial Test Specification',
        status: 'untested'
      },
      {
        version: 'v1.1',
        updatedBy: 'Somchai Prasert',
        timestamp: '2026-09-25T11:00:00Z',
        changeSummary: 'เพิ่ม Test Data และ Step 3 Webhook Reconciliation',
        status: 'in_progress'
      },
      {
        version: 'v1.2',
        updatedBy: 'Somchai Prasert',
        timestamp: '2026-09-30T10:15:00Z',
        changeSummary: 'รันการทดสอบจริงสำเร็จ แนบภาพหลักฐานผลการทดสอบ',
        status: 'passed'
      }
    ],
    activeUser: {
      id: 'user-1',
      name: 'Somchai Prasert',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      action: 'editing'
    },
    createdAt: '2026-09-20T08:00:00Z',
    updatedAt: '2026-09-30T10:15:00Z',
  },
  {
    id: 'TC-101-1',
    numericId: 101,
    parentId: 'TC-101', // Sub-test case under TC-101!
    projectId: 'proj-1',
    requirement: 'REQ-PAY-01-EXP: PromptPay QR Code จะต้องหมดอายุภายใน 15 นาที และไม่สามารถชำระเงินซ้ำได้',
    testScenario: 'ทดสอบการชำระเงินผ่าน QR Code ที่หมดอายุแล้ว (Expired QR)',
    name: '[Sub-case] ตรวจสอบระบบปฏิเสธการชำระเงินเมื่อ QR Code เกินเวลา 15 นาที',
    description: 'ทดสอบ Boundary Timeouts เมื่อผู้ซื้อปล่อยหน้าจอทิ้งไว้จน QR หมดอายุ แล้วพยายามโอนเงิน',
    prerequisite: 'สร้าง Dynamic QR Code ทิ้งไว้เกิน 15 นาที หรือตั้ง Mock Time forward 16 นาที',
    steps: [
      {
        id: 's-201',
        stepNumber: 1,
        action: 'เปิดหน้าชำระเงินและรอจนนับถอยหลังหมดเวลา (Expired)',
        testData: 'QR Reference: QR-TIMEOUT-991',
        expectedResult: 'หน้าจอแสดง Alert "QR Code หมดอายุ กรุณาสร้างใหม่"',
      },
      {
        id: 's-202',
        stepNumber: 2,
        action: 'พยายามยิง Webhook Bank ชำระเงินด้วย Reference ที่หมดอายุแล้ว',
        testData: 'POST /v1/callbacks/bank with expired txRef',
        expectedResult: 'ระบบตอบกลับ Error 400 QR_EXPIRED และทำ Auto-refund ทันที',
      },
    ],
    expectedResults: 'ระบบต้อง Reject ธุรกรรมทันทีและบันทึก Error Code QR_EXPIRED ใน Audit log',
    expectedImages: [],
    actualResults: 'พบว่าข้อความแจ้งเตือนแสดงถูกต้อง และ Webhook ปฏิเสธสถานะตามที่คาดหวัง',
    actualImages: [],
    status: 'passed',
    priority: 'high',
    expiryDate: '2026-10-02', // expiring soon!
    assignedTo: 'Pitchaya Srisuk',
    executedBy: 'Pitchaya Srisuk',
    executedAt: '2026-09-29T14:20:00Z',
    version: 'v1.0',
    versionHistory: [
      {
        version: 'v1.0',
        updatedBy: 'Pitchaya Srisuk',
        timestamp: '2026-09-22T09:00:00Z',
        changeSummary: 'สร้าง Sub-test case ทดสอบ timeout',
        status: 'passed'
      }
    ],
    activeUser: {
      id: 'user-2',
      name: 'Pitchaya Srisuk',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      action: 'viewing'
    },
    createdAt: '2026-09-22T09:00:00Z',
    updatedAt: '2026-09-29T14:20:00Z',
  },
  {
    id: 'TC-103',
    numericId: 103,
    parentId: null,
    projectId: 'proj-1',
    requirement: 'REQ-PAY-03: ระบบต้องป้องกัน Double Spending และ Replay Attacks',
    testScenario: 'ทดสอบยิง Webhook ซ้ำพร้อมกัน 10 threads ด้วย Transaction Reference เดียวกัน',
    name: 'Concurrency & Idempotency Test สำหรับ Bank Callback',
    description: 'ทดสอบการกดขี่ระบบด้วย Concurrency เพื่อดูว่าระบบมีการทำ Distributed Lock (Redis/DB lock) หรือไม่ เพื่อป้องกันการเพิ่ม Balance ซ้ำสองครั้ง',
    prerequisite: 'JMeter หรือ k6 script เตรียม payload 10 concurrent requests',
    steps: [
      {
        id: 's-301',
        stepNumber: 1,
        action: 'ยิง 10 requests ไปที่ endpoint webhook พร้อม transaction_id เดียวกันในเสี้ยววินาที',
        testData: 'Concurrent threads: 10, txn_id: "TXN-CONCURRENT-001"',
        expectedResult: 'Request แรกสำเร็จ (HTTP 200) และอีก 9 requests ตอบ HTTP 409 หรือ HTTP 200 (Duplicate handled idempotently)',
      },
    ],
    expectedResults: 'ยอดเงินเครดิตเข้ากระเป๋าร้านค้าเพียง 1 ครั้งถ้วน ไม่มียอดเบิ้ลเด็ดขาด',
    expectedImages: [],
    actualResults: 'ยังพบ Race Condition ในบางรอบ ทำให้เกิดยอดบันทึกซ้ำ 2 รายการ! ตีกลับให้ Dev แก้ไข Lock Key ด่วน',
    actualImages: [],
    status: 'failed',
    priority: 'critical',
    expiryDate: '2026-09-29', // Overdue 1 วัน!
    assignedTo: 'สมชาย ประเสริฐ (QA Lead)',
    assignedDev: 'กิตติศักดิ์ พัฒนา (Dev Lead)',
    rootCauseTag: 'Race Condition',
    churnCount: 3, // แก้ซ้ำ 3 รอบ!
    executedBy: 'สมชาย ประเสริฐ (QA Lead)',
    executedAt: '2026-09-30T09:00:00Z',
    version: 'v1.3',
    versionHistory: [
      {
        version: 'v1.0',
        updatedBy: 'สมชาย ประเสริฐ (QA)',
        timestamp: '2026-09-22T11:00:00Z',
        changeSummary: 'สร้าง Concurrency Test Scenarios',
        status: 'untested'
      },
      {
        version: 'v1.1',
        updatedBy: 'กิตติศักดิ์ พัฒนา (Dev)',
        timestamp: '2026-09-26T14:00:00Z',
        changeSummary: 'Dev ส่งมอบรอบที่ 1 พร้อม Redis lock',
        status: 'ready_for_test'
      },
      {
        version: 'v1.2',
        updatedBy: 'สมชาย ประเสริฐ (QA)',
        timestamp: '2026-09-27T10:00:00Z',
        changeSummary: 'รัน k6 automated test รอบที่ 1 พบ Lock timeout ตีกลับให้ Dev',
        status: 'failed'
      },
      {
        version: 'v1.3',
        updatedBy: 'สมชาย ประเสริฐ (QA)',
        timestamp: '2026-09-29T16:30:00Z',
        changeSummary: 'เทสรอบที่ 2 ยังพบ Race condition ใน High-load ตีกลับรอบที่ 3',
        status: 'failed'
      }
    ],
    activeUser: {
      id: 'user-3',
      name: 'กิตติศักดิ์ พัฒนา (Dev Lead)',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      action: 'editing'
    },
    createdAt: '2026-09-22T11:00:00Z',
    updatedAt: '2026-09-29T16:30:00Z',
  },
  {
    id: 'TC-104',
    numericId: 104,
    parentId: null,
    projectId: 'proj-1',
    requirement: 'REQ-PAY-04: Callback Retry Strategy & Exponential Backoff',
    testScenario: 'ทดสอบจำลอง Merchant Server ล่ม และระบบต้อง Retry ยิง Webhook แบบทวีคูณ',
    name: 'Webhook Exponential Backoff & Dead Letter Queue (DLQ)',
    description: 'ตรวจสอบว่าระบบสามารถ Retry Webhook ตามช่วงเวลา 5s, 30s, 5m, 1h และเก็บลง DLQ หากเกิน 24 ชม.',
    prerequisite: 'Mock Server จำลอง HTTP 503 Service Unavailable',
    steps: [
      {
        id: 's-401',
        stepNumber: 1,
        action: 'ส่งคำสั่ง Callback ไปยัง endpoint ที่จำลองสถานะ 503',
        testData: 'retry_count=1, delay=5s',
        expectedResult: 'ระบบยิงซ้ำตามจังหวะเวลาที่กำหนดอย่างแม่นยำ',
      }
    ],
    expectedResults: 'ระบบ Retry ครบ 5 ครั้งแล้วย้าย Payload เข้า DLQ เพื่อรอ Manual Retry',
    expectedImages: [],
    actualResults: 'ยังรอ Dev ปรับจูน Backoff algorithm เนื่องจาก Requirement มีจุดขัดแย้ง',
    actualImages: [],
    status: 'pending',
    priority: 'high',
    expiryDate: '2026-09-28', // Overdue 2 วัน!
    assignedTo: 'พิชญา ศรีสุข (Senior Tester)',
    assignedDev: 'ธนากร สุขใจ (Backend API)',
    rootCauseTag: 'Spec Gap',
    churnCount: 2,
    version: 'v1.2',
    versionHistory: [
      {
        version: 'v1.0',
        updatedBy: 'พิชญา ศรีสุข',
        timestamp: '2026-09-20T08:00:00Z',
        changeSummary: 'Initial Spec Draft',
        status: 'pending'
      },
      {
        version: 'v1.1',
        updatedBy: 'ธนากร สุขใจ (Dev)',
        timestamp: '2026-09-25T11:00:00Z',
        changeSummary: 'ส่งมอบรอบแรก',
        status: 'ready_for_test'
      },
      {
        version: 'v1.2',
        updatedBy: 'พิชญา ศรีสุข (QA)',
        timestamp: '2026-09-28T10:00:00Z',
        changeSummary: 'Requirement ของ DLQ ไม่ตรงกับ PO ตีกลับให้ Dev แก้ไขตาม Spec ใหม่',
        status: 'pending'
      }
    ],
    activeUser: {
      id: 'user-dev-2',
      name: 'ธนากร สุขใจ (Backend API)',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      action: 'editing'
    },
    createdAt: '2026-09-20T08:00:00Z',
    updatedAt: '2026-09-28T10:00:00Z',
  },
  {
    id: 'TC-201',
    numericId: 201,
    parentId: null,
    projectId: 'proj-2',
    requirement: 'REQ-SHOP-05: ตะกร้าสินค้าและการตัดสต็อกแบบ Real-time ในช่วง Flash Sale',
    testScenario: 'ทดสอบการสั่งซื้อสินค้าชิ้นสุดท้ายพร้อมกัน 100 คน',
    name: 'Flash Sale Cart Checkout Stock Depletion Test',
    description: 'จำลองผู้ใช้ 100 คนเข้ากดแย่งซื้อสินค้าชิ้นสุดท้าย ตรวจสอบว่าสินค้าต้องไม่ติดลบ',
    prerequisite: 'สต็อกคงเหลือ 1 ชิ้นในคลังสินค้า',
    steps: [
      {
        id: 's-401',
        stepNumber: 1,
        action: 'ส่งคำสั่ง Checkout พร้อมกันเมื่อนับถอยหลัง Flash Sale ถึง 00:00:00',
        testData: 'SKU: IPHONE16-PRO, Stock: 1, Users: 100',
        expectedResult: 'ผู้ใช้คนแรกได้รับ Order Success อีก 99 คนได้รับข้อความ "สินค้าหมดชั่วคราว"',
      },
    ],
    expectedResults: 'ตัดสต็อกเหลือ 0 พอดี ห้ามเกิด Over-selling ติดลบ',
    expectedImages: [],
    actualResults: 'กำลังเตรียม Data สำหรับรัน Test รอบเย็นวันนี้',
    actualImages: [],
    status: 'in_progress',
    priority: 'high',
    expiryDate: '2026-10-05',
    assignedTo: 'Pitchaya Srisuk',
    version: 'v1.0',
    versionHistory: [
      {
        version: 'v1.0',
        updatedBy: 'Pitchaya Srisuk',
        timestamp: '2026-09-28T08:00:00Z',
        changeSummary: 'สร้าง Initial Flash Sale Test Spec',
        status: 'in_progress'
      }
    ],
    createdAt: '2026-09-28T08:00:00Z',
    updatedAt: '2026-09-30T05:30:00Z',
  },
  {
    id: 'TC-202',
    numericId: 202,
    parentId: null,
    projectId: 'proj-2',
    requirement: 'REQ-SHOP-08: การคำนวณโค้ดส่วนลด Tiered Coupon',
    testScenario: 'ใช้โค้ดส่วนลด 50% ร่วมกับส่งฟรี',
    name: 'คำนวณส่วนลดคูปองแบบซ้อนและยอดขั้นต่ำ',
    description: 'ทดสอบว่าระบบยอมรับคูปองตามเงื่อนไขและไม่สามารถใช้คูปองซ้ำซ้อนในหมวดที่ห้ามใช้',
    prerequisite: 'User มีคูปอง FLASH50 และ FREESHIP ใน Wallet',
    steps: [
      {
        id: 's-501',
        stepNumber: 1,
        action: 'ใส่คูปอง FLASH50 และ FREESHIP ลงในตะกร้า',
        testData: 'Cart Total: 1,000 THB',
        expectedResult: 'ลดราคาสินค้า 500 บาท และหักค่าส่ง 50 บาท ยอดสุทธิ 500 บาท',
      },
    ],
    expectedResults: 'ยอดเงินสุทธิคำนวณถูกต้องตาม Business Logic',
    expectedImages: [],
    actualResults: '',
    actualImages: [],
    status: 'untested',
    priority: 'medium',
    expiryDate: '2026-10-14',
    assignedTo: 'Somchai Prasert',
    version: 'v1.0',
    createdAt: '2026-09-29T10:00:00Z',
    updatedAt: '2026-09-29T10:00:00Z',
  },
]

// --- API ------------------------------------------------------------------------
/**
 * Re-applies demo fields that older saved data may be missing. Runs once only:
 * after users reorder (ids are renumbered) or delete cases, "TC-103" or "TC-104"
 * may be a different case or gone on purpose, so these fixes must not run again.
 */
function testCases(): TestCase[] {
  migrateOnce('demo-cases-v1', () => {
    const cases = load(STORAGE_KEYS.testCases, SEED_TEST_CASES)
    const demo = (tc: TestCase, id: string) => tc.projectId === 'proj-1' && tc.id === id
    for (const tc of cases) {
      if (demo(tc, 'TC-102') && tc.parentId === 'TC-101') tc.id = 'TC-101-1'
      if (demo(tc, 'TC-103') && (!tc.churnCount || !tc.rootCauseTag)) {
        Object.assign(tc, { churnCount: 3, rootCauseTag: 'Race Condition', expiryDate: '2026-09-29', assignedDev: 'กิตติศักดิ์ พัฒนา (Dev Lead)' })
      }
    }
    const sample104 = SEED_TEST_CASES.find((c) => c.id === 'TC-104')
    if (sample104 && !cases.some((c) => demo(c, 'TC-104'))) cases.push(sample104)
    save(STORAGE_KEYS.testCases, cases)
  })
  // versions saved before snapshots existed: keep at least the current version's spec, so it can be restored later
  migrateOnce('version-snapshots-v1', () => {
    const cases = load(STORAGE_KEYS.testCases, SEED_TEST_CASES)
    for (const tc of cases) {
      const current = [...(tc.versionHistory ?? [])].reverse().find((r) => r.version === tc.version)
      if (current && !current.snapshot) current.snapshot = specOf(tc)
    }
    save(STORAGE_KEYS.testCases, cases)
  })
  return load(STORAGE_KEYS.testCases, SEED_TEST_CASES)
}

const sameCase = (a: TestCase, projectId: string, id: string) => a.projectId === projectId && a.id === id

/** GET /test-cases */
export const fetchTestCases = () => respond(testCases)

/**
 * POST /projects/:projectId/test-cases (accepts several for import / AI drafts)
 * The server builds the case (v1.0, first history entry, timestamps) and assigns the next
 * TC number to inputs without an id; a given id must be free in the project.
 */
export const createTestCases = (projectId: string, inputs: TestCaseInput[], actor: Actor) =>
  respond(() => {
    const list = testCases()
    const now = new Date().toISOString()
    let next = list.filter((x) => x.projectId === projectId && !x.parentId).reduce((max, x) => Math.max(max, x.numericId || 100), 100) + 1
    const created: TestCase[] = []
    for (const input of inputs) {
      const { changeSummary: _summary, bumpMajor: _major, ...data } = input
      const numericId = data.id ? data.numericId : next
      const id = data.id?.trim() || `TC-${next}`
      if (!data.id) next++
      if ([...list, ...created].some((x) => sameCase(x, projectId, id))) throw new ApiError(`รหัส ${id} มีอยู่แล้วในโปรเจกต์นี้`, 409)
      const version = data.version || 'v1.0'
      created.push({
        ...data,
        id,
        numericId,
        projectId,
        version,
        versionHistory: data.versionHistory?.length
          ? data.versionHistory
          : [{ version, updatedBy: actor.name, timestamp: now, changeSummary: 'สร้าง Test Case ครั้งแรก', status: data.status, snapshot: specOf(data) }],
        activeUser: presenceOf(actor),
        createdAt: now,
        updatedAt: now,
      })
    }
    // appended: the stored order is the list order users arrange by drag and drop
    save(STORAGE_KEYS.testCases, [...list, ...created])
    return created
  })

/** server-side: the stored case, if any */
export const storedCase = (projectId: string, id: string): TestCase | undefined => testCases().find((x) => sameCase(x, projectId, id))

/**
 * server-side: load, patch (see applyCasePatch) and save one case. Used by the update endpoint
 * and by run results that become the case status.
 */
export function patchStoredCase(projectId: string, id: string, patch: Partial<TestCaseInput>, actor: Actor): TestCaseUpdateResult {
  const list = testCases()
  const i = list.findIndex((x) => sameCase(x, projectId, id))
  if (i < 0) throw new ApiError(`ไม่พบ ${id}`, 404)
  if (list[i].archivedAt) throw new ApiError(`${id} อยู่ในคลังเก็บ กู้คืนก่อนจึงแก้ไขได้`, 409)
  const result = applyCasePatch(list[i], patch, actor)
  list[i] = result.testCase
  save(STORAGE_KEYS.testCases, list)
  return result
}

/** PATCH /projects/:projectId/test-cases/:id (the server versions the case: see applyCasePatch) */
export const updateTestCase = (projectId: string, id: string, patch: Partial<TestCaseInput>, actor: Actor) =>
  respond(() => patchStoredCase(projectId, id, patch, actor))

/**
 * POST /projects/:projectId/test-cases/:id/versions/:version/restore
 * Brings back the spec of an earlier version as a new version (same rules as an edit:
 * a passed case must be tested again). Images stay as they are (they are not kept in history).
 */
export const restoreVersion = (projectId: string, id: string, version: string, actor: Actor) =>
  respond(() => {
    const tc = storedCase(projectId, id)
    if (!tc) throw new ApiError(`ไม่พบ ${id}`, 404)
    const snapshot = tc.versionHistory?.find((r) => r.version === version)?.snapshot
    if (!snapshot) throw new ApiError(`${version} ไม่มีเนื้อหาที่บันทึกไว้ให้กู้คืน`, 404)
    const requirements = requirementsOf(projectId)
    if (!specDiff(snapshot, tc, projectId, requirements).length) throw new ApiError(`เนื้อหาของ ${version} เหมือนเวอร์ชันปัจจุบันแล้ว`, 409)
    // keep the links the old text resolved to, rather than dropping explicit links
    const spec = specOf(withEffectiveLinks(snapshot, projectId, requirements))
    return patchStoredCase(projectId, id, { ...spec, changeSummary: `กู้คืนเนื้อหาจาก ${version}` }, actor)
  })

/** PATCH /projects/:projectId/test-cases/:id/due-date (reason required; a due date is not part of the spec: no new version) */
export const extendDueDate = (projectId: string, id: string, newDate: string, reason: string, actor: Actor) =>
  respond(() => {
    if (!reason.trim()) throw new ApiError('ต้องระบุเหตุผลในการขยายเวลา', 422)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) throw new ApiError('วันที่ไม่ถูกต้อง', 422)
    const list = testCases()
    const tc = list.find((x) => sameCase(x, projectId, id))
    if (!tc) throw new ApiError(`ไม่พบ ${id}`, 404)
    if (tc.archivedAt) throw new ApiError(`${id} อยู่ในคลังเก็บ กู้คืนก่อนจึงแก้ไขได้`, 409)
    const oldDate = tc.expiryDate
    Object.assign(tc, { expiryDate: newDate, activeUser: presenceOf(actor), updatedAt: new Date().toISOString() })
    save(STORAGE_KEYS.testCases, list)
    return { testCase: tc, oldDate }
  })

/** the case and, for a parent, its sub-cases */
const withSubs = (list: TestCase[], projectId: string, id: string) =>
  list.filter((x) => x.projectId === projectId && (x.id === id || x.parentId === id))

/**
 * POST /projects/:projectId/test-cases/:id/archive (with its sub-cases)
 * The default way to remove a case: it keeps its id (never reused while archived) and every
 * run result, defect and audit entry stays attached, so it can be restored.
 */
export const archiveTestCase = (projectId: string, id: string, actor: Actor) =>
  respond(() => {
    const list = testCases()
    const target = list.find((x) => sameCase(x, projectId, id))
    if (!target) throw new ApiError(`ไม่พบ ${id}`, 404)
    if (target.archivedAt) throw new ApiError(`${id} อยู่ในคลังเก็บแล้ว`, 409)
    const now = new Date().toISOString()
    const archived = withSubs(list, projectId, id).filter((x) => !x.archivedAt)
    archived.forEach((x) => Object.assign(x, { archivedAt: now, archivedBy: actor.name, activeUser: null }))
    save(STORAGE_KEYS.testCases, list)
    return archived
  })

/** POST /projects/:projectId/test-cases/:id/restore (with the sub-cases archived together with it) */
export const restoreTestCase = (projectId: string, id: string) =>
  respond(() => {
    const list = testCases()
    const target = list.find((x) => sameCase(x, projectId, id))
    if (!target) throw new ApiError(`ไม่พบ ${id}`, 404)
    if (!target.archivedAt) throw new ApiError(`${id} ไม่ได้อยู่ในคลังเก็บ`, 409)
    const parent = target.parentId ? list.find((x) => sameCase(x, projectId, target.parentId!)) : undefined
    if (parent?.archivedAt) throw new ApiError(`กู้คืนเคสหลัก ${parent.id} ก่อน`, 409)
    const restored = withSubs(list, projectId, id).filter((x) => x.archivedAt === target.archivedAt)
    restored.forEach((x) => {
      delete x.archivedAt
      delete x.archivedBy
    })
    save(STORAGE_KEYS.testCases, list)
    return restored
  })

/** GET /projects/:projectId/test-cases/:id/impact (what archiving or deleting it, with its sub-cases, touches) */
export const caseImpact = (projectId: string, id: string) =>
  respond<TestCaseImpact>(() => {
    const list = testCases()
    const cases = withSubs(list, projectId, id)
    if (!cases.length) throw new ApiError(`ไม่พบ ${id}`, 404)
    const ids = cases.map((x) => x.id)
    const remaining = list.filter((x) => x.projectId === projectId && !x.archivedAt && !ids.includes(x.id))
    return {
      caseIds: ids,
      runs: runsOf(projectId)
        .filter((r) => r.results.some((x) => ids.includes(x.caseId) && !x.caseDeleted))
        .map((r) => ({ name: r.name, round: r.round, open: r.status !== 'completed' })),
      openDefects: defectsOf(projectId)
        .filter((d) => d.caseId && ids.includes(d.caseId) && !d.caseDeleted && isOpenDefect(d))
        .map((d) => ({ id: d.id, title: d.title })),
      requirements: requirementsOf(projectId)
        .filter((r) => casesForRequirement(r, cases).length)
        .map((r) => ({ code: r.code, title: r.title, uncovered: !casesForRequirement(r, remaining).length })),
    }
  })

/**
 * DELETE /projects/:projectId/test-cases/:id (and its sub-cases): permanent, archived cases only.
 * Ids are reused later (new cases, renumbering), so everything that pointed at the deleted
 * cases is detached: run results and defects keep the old id as history only, alerts lose the link.
 * Returns the deleted ids.
 */
export const deleteTestCase = (projectId: string, id: string) =>
  respond(() => {
    const list = testCases()
    const target = list.find((x) => sameCase(x, projectId, id))
    if (!target) throw new ApiError(`ไม่พบ ${id}`, 404)
    if (!target.archivedAt) throw new ApiError(`เก็บ ${id} เข้าคลังก่อน จึงลบถาวรได้`, 409)
    const ids = withSubs(list, projectId, id).map((x) => x.id)
    detachRunCases(projectId, ids)
    detachDefectCases(projectId, ids)
    detachNotificationCases(projectId, ids)
    detachAuditCases(projectId, ids)
    save(STORAGE_KEYS.testCases, list.filter((x) => !(x.projectId === projectId && ids.includes(x.id))))
    return ids
  })

/**
 * PUT /projects/:projectId/test-cases/order (the active cases, as shown in the list)
 * Renumbers ids in the given order (TC-101, TC-102 … and TC-101-1, TC-101-2 …), archived cases
 * after the active ones (archived sub-cases after their parent's active ones), and
 * re-keys every record that points at a case (run results, defects, notifications,
 * audit entries), so they keep pointing at the same case after its id changes.
 */
export const reorderTestCases = (projectId: string, order: TestCaseOrder[]) =>
  respond<TestCaseReorderResult>(() => {
    const list = testCases()
    const mine = list.filter((x) => x.projectId === projectId)
    const taken = new Set<string>()
    const renames: Record<string, string> = {}
    const renumber = (oldId: string, id: string, numericId: number, parentId: string | null): TestCase => {
      const tc = mine.find((x) => x.id === oldId)
      if (!tc || taken.has(oldId)) throw new ApiError(`ไม่พบ ${oldId} กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง`, 409)
      taken.add(oldId)
      if (oldId !== id) renames[oldId] = id
      return { ...tc, id, numericId, parentId }
    }
    const subsOf = (parentId: string) => mine.filter((x) => x.parentId === parentId)
    const full: TestCaseOrder[] = [
      ...order.map((o) => ({ id: o.id, subIds: [...o.subIds, ...subsOf(o.id).filter((x) => x.archivedAt).map((x) => x.id)] })),
      ...mine.filter((x) => !x.parentId && x.archivedAt).map((p) => ({ id: p.id, subIds: subsOf(p.id).map((x) => x.id) })),
    ]
    const cases = full.flatMap(({ id: oldId, subIds }, p) => {
      const numericId = 101 + p
      const id = `TC-${numericId}`
      return [renumber(oldId, id, numericId, null), ...subIds.map((subId, s) => renumber(subId, `${id}-${s + 1}`, numericId, id))]
    })
    // a case was added elsewhere since the page loaded: refuse rather than drop it
    if (cases.length !== mine.length) throw new ApiError('รายการ Test Case เปลี่ยนไประหว่างจัดลำดับ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง', 409)

    if (Object.keys(renames).length) {
      renameRunCases(projectId, renames)
      renameDefectCases(projectId, renames)
      renameNotificationCases(projectId, renames)
      renameAuditCases(projectId, renames)
    }
    save(STORAGE_KEYS.testCases, [...cases, ...list.filter((x) => x.projectId !== projectId)])
    return { cases, renames }
  })
