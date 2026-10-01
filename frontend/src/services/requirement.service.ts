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
import { SEED_REQUIREMENTS } from './seeds/requirements.seed'

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
