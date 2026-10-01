import type {
  CoverageStatus,
  Option,
  Requirement,
  RequirementChangeResult,
  RequirementInput,
  RequirementStatus,
  RequirementType,
  TestCase,
} from '@/types'
import { ApiError, newId, respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan } from './project.service'
import { STORAGE_KEYS, load, save } from './storage.service'
import { flagCasesForReview } from './test-case.service'

export const REQUIREMENT_TYPES: Option<RequirementType>[] = [
  { value: 'functional', label: 'Functional', hint: 'ความสามารถของระบบ', tone: 'primary', icon: 'tabler:puzzle' },
  { value: 'non_functional', label: 'Non-functional', hint: 'ประสิทธิภาพ ความปลอดภัย', tone: 'info', icon: 'tabler:gauge' },
  { value: 'business_rule', label: 'Business rule', hint: 'กฎทางธุรกิจ', tone: 'warning', icon: 'tabler:scale' },
]

export const REQUIREMENT_STATUSES: Option<RequirementStatus>[] = [
  { value: 'draft', label: 'Draft', hint: 'ร่าง', tone: 'secondary', icon: 'tabler:pencil' },
  { value: 'approved', label: 'Approved', hint: 'อนุมัติแล้ว', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'changed', label: 'Changed', hint: 'มีการเปลี่ยนแปลง ต้องทบทวนเคส', tone: 'caution', icon: 'tabler:alert-triangle' },
  { value: 'deprecated', label: 'Deprecated', hint: 'ยกเลิกแล้ว', tone: 'secondary', icon: 'tabler:archive' },
]

export const COVERAGE: Option<CoverageStatus>[] = [
  { value: 'not_covered', label: 'ยังไม่มีเคส', tone: 'error', icon: 'tabler:circle-dashed' },
  { value: 'not_run', label: 'ยังไม่ทดสอบ', tone: 'secondary', icon: 'tabler:clock' },
  { value: 'in_progress', label: 'กำลังทดสอบ', tone: 'warning', icon: 'tabler:progress' },
  { value: 'failed', label: 'มีเคสไม่ผ่าน', tone: 'error', icon: 'tabler:circle-x' },
  { value: 'passed', label: 'ผ่านทั้งหมด', tone: 'success', icon: 'tabler:circle-check' },
]

export const requirementTypeOf = (v: RequirementType) => REQUIREMENT_TYPES.find((t) => t.value === v) ?? REQUIREMENT_TYPES[0]
export const requirementStatusOf = (v: RequirementStatus) => REQUIREMENT_STATUSES.find((s) => s.value === v) ?? REQUIREMENT_STATUSES[0]
export const coverageOf = (v: CoverageStatus) => COVERAGE.find((c) => c.value === v) ?? COVERAGE[0]

/** the text starts with the whole code: "REQ-PAY-1: …" mentions REQ-PAY-1 but not REQ-PAY-10 */
const mentionsCode = (text: string, code: string) => text.startsWith(code) && !/^[\w-]/.test(text.slice(code.length))

/** linked explicitly; cases without links (imported / legacy) fall back to text that starts with the code */
const isLinked = (req: Requirement, tc: TestCase) =>
  tc.projectId === req.projectId &&
  (tc.requirementIds?.length ? tc.requirementIds.includes(req.id) : mentionsCode(tc.requirement?.trim() ?? '', req.code))

export const casesForRequirement = (req: Requirement, cases: TestCase[]): TestCase[] => cases.filter((c) => isLinked(req, c))

export const requirementsForCase = (tc: TestCase, requirements: Requirement[]): Requirement[] => requirements.filter((r) => isLinked(r, tc))

/**
 * What a case shows as its requirement: the linked records ("CODE: title", always current),
 * then the case's own note when it adds something. Unlinked cases show their free text.
 */
export function requirementText(tc: TestCase, requirements: Requirement[]): string {
  const linked = requirementsForCase(tc, requirements)
  const note = tc.requirement?.trim() ?? ''
  if (!linked.length) return note
  const lines = linked.map((r) => `${r.code}: ${r.title}`)
  // text auto-filled from a link, or legacy text naming the code, only repeats the link
  if (note && !linked.some((r) => mentionsCode(note, r.code))) lines.push(note)
  return lines.join('\n')
}

export function coverageStatus(cases: TestCase[]): CoverageStatus {
  if (!cases.length) return 'not_covered'
  if (cases.some((c) => c.status === 'failed' || c.status === 'blocked')) return 'failed'
  if (cases.every((c) => c.status === 'passed')) return 'passed'
  if (cases.some((c) => c.status === 'passed' || c.status === 'in_progress')) return 'in_progress'
  return 'not_run'
}

const at = '2026-09-15T09:00:00Z'
const req = (
  projectId: string,
  code: string,
  title: string,
  type: RequirementType,
  priority: Requirement['priority'],
  status: RequirementStatus,
  acceptanceCriteria: string[],
  description = '',
  source = 'PRD v2.1',
): Requirement => ({
  id: `req-${code.toLowerCase()}`,
  projectId,
  code,
  title,
  description,
  type,
  priority,
  status,
  source,
  acceptanceCriteria,
  createdAt: at,
  updatedAt: at,
})

const SEED_REQUIREMENTS: Requirement[] = [
  req(
    'proj-1',
    'REQ-PAY-01',
    'สร้าง Dynamic PromptPay QR ตามยอดเงิน',
    'functional',
    'critical',
    'approved',
    ['QR ถูกต้องตามมาตรฐาน EMVCo', 'QR หมดอายุใน 15 นาที', 'สถานะเป็น PAID ภายใน 2 วินาทีหลังได้รับ Webhook'],
    'ผู้ใช้สามารถสร้าง Dynamic PromptPay QR Code สำหรับชำระเงินตามยอดที่ระบุได้',
  ),
  req('proj-1', 'REQ-PAY-02', 'ปฏิเสธการชำระด้วย QR ที่หมดอายุ', 'business_rule', 'high', 'approved', [
    'ธนาคารปฏิเสธรายการเมื่อ QR หมดอายุ',
    'ผู้ใช้สร้าง QR ใหม่ได้ทันที',
  ]),
  req(
    'proj-1',
    'REQ-PAY-03',
    'ป้องกัน Double Spending และ Replay Attack',
    'non_functional',
    'critical',
    'changed',
    ['Webhook ซ้ำไม่สร้างรายการซ้ำ', 'รองรับ 10 requests พร้อมกันด้วย txRef เดียว'],
    'ระบบต้องป้องกันการบันทึกรายการซ้ำจาก callback ที่ส่งซ้ำ',
    'Security review 2026-09',
  ),
  req('proj-1', 'REQ-PAY-04', 'Webhook Retry แบบ Exponential Backoff และ DLQ', 'non_functional', 'high', 'approved', [
    'Retry สูงสุด 5 ครั้ง',
    'ส่งเข้า Dead Letter Queue เมื่อเกินจำนวน',
  ]),
  req('proj-1', 'REQ-PAY-05', 'ออกใบเสร็จอิเล็กทรอนิกส์ทางอีเมล', 'functional', 'medium', 'draft', ['ส่งอีเมลภายใน 1 นาที', 'แนบ PDF ใบเสร็จ']),
  req('proj-1', 'REQ-PAY-06', 'Dashboard สรุปยอดรายวันสำหรับ Merchant', 'functional', 'low', 'approved', [
    'แสดงยอดรวมและจำนวนรายการ',
    'Export CSV ได้',
  ]),
  req('proj-2', 'REQ-SHOP-01', 'Flash Sale จำกัดจำนวนต่อผู้ใช้', 'business_rule', 'critical', 'approved', [
    'ซื้อได้ไม่เกิน 2 ชิ้นต่อบัญชี',
    'ไม่มี Overselling',
  ]),
  req('proj-2', 'REQ-SHOP-02', 'แลกคะแนนเป็นส่วนลด', 'functional', 'medium', 'approved', ['100 คะแนน = 10 บาท']),
  req('proj-3', 'REQ-AUTH-01', 'เข้าสู่ระบบด้วย SSO (OIDC)', 'functional', 'critical', 'approved', ['รองรับ Azure AD และ Google Workspace']),
  req('proj-3', 'REQ-AUTH-02', 'ยืนยันตัวตนสองชั้นด้วย FIDO2', 'non_functional', 'high', 'draft', ['รองรับ Security key และ Passkey']),
]

// --- API ------------------------------------------------------------------------
const requirements = () => load(STORAGE_KEYS.requirements, SEED_REQUIREMENTS)

/** server-side: the stored requirements of a project */
export const requirementsOf = (projectId: string): Requirement[] => requirements().filter((r) => r.projectId === projectId)

/** GET /requirements (of the projects the signed-in user may open) */
export const fetchRequirements = () => respond(() => (sessionCan('requirement.view') ? inAccessibleProjects(requirements()) : []))

/** what a requirement says; a change here means the linked cases must be reviewed (type / priority / status don't) */
const MEANING_FIELDS: { field: 'title' | 'description' | 'acceptanceCriteria'; label: string }[] = [
  { field: 'title', label: 'ชื่อ' },
  { field: 'description', label: 'รายละเอียด' },
  { field: 'acceptanceCriteria', label: 'เกณฑ์การยอมรับ' },
]

/**
 * POST /projects/:projectId/requirements · PUT /requirements/:id
 * When the meaning of an existing requirement changes, the server flags its linked cases for review.
 */
export const saveRequirement = (input: RequirementInput) =>
  respond<RequirementChangeResult>(() => {
    assertCan('requirement.edit', input.projectId)
    const list = requirements()
    const now = new Date().toISOString()
    if (list.some((r) => r.projectId === input.projectId && r.code === input.code && r.id !== input.id)) {
      throw new ApiError(`รหัส ${input.code} มีอยู่แล้ว`, 409)
    }
    if (input.id) {
      const i = list.findIndex((r) => r.id === input.id)
      if (i < 0) throw new ApiError('ไม่พบ Requirement', 404)
      const before = list[i]
      list[i] = { ...before, ...input, id: input.id, updatedAt: now }
      save(STORAGE_KEYS.requirements, list)
      const changed = MEANING_FIELDS.filter((m) => JSON.stringify(before[m.field]) !== JSON.stringify(list[i][m.field])).map((m) => m.label)
      const flaggedCases = changed.length ? flagCasesForReview(list[i], `${list[i].code} แก้ไข: ${changed.join(', ')}`) : []
      return { requirement: list[i], flaggedCases }
    }
    const created: Requirement = { ...input, id: newId('req'), createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.requirements, [...list, created])
    return { requirement: created, flaggedCases: [] }
  })

/** DELETE /requirements/:id (its linked cases are flagged for review: they lost what they test) */
export const deleteRequirement = (id: string) =>
  respond<RequirementChangeResult>(() => {
    const list = requirements()
    const target = list.find((r) => r.id === id)
    if (!target) throw new ApiError('ไม่พบ Requirement', 404)
    assertCan('requirement.delete', target.projectId)
    save(
      STORAGE_KEYS.requirements,
      list.filter((r) => r.id !== id),
    )
    return { flaggedCases: flagCasesForReview(target, `${target.code} ถูกลบ`) }
  })
