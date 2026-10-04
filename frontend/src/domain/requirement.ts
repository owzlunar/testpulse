import type { CoverageStatus, Option, Requirement, RequirementImportRow, RequirementOrigin, RequirementStatus, RequirementType } from '@/types'
import { priorityFromText } from './test-case'

// Rules the backend shares (links between requirements and cases) live in ./rules/requirement.ts
export * from './rules/requirement'

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

export const REQUIREMENT_ORIGINS: Option<RequirementOrigin>[] = [
  { value: 'tor', label: 'TOR', hint: 'ตามข้อกำหนดใน TOR', tone: 'primary', icon: 'tabler:file-certificate' },
  { value: 'additional', label: 'เพิ่มเติม', hint: 'นอกเหนือ TOR เช่น จากการประชุมหรือ Change Request', tone: 'secondary', icon: 'tabler:file-plus' },
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

export const requirementOriginOf = (v: RequirementOrigin) => REQUIREMENT_ORIGINS.find((o) => o.value === v) ?? REQUIREMENT_ORIGINS[1]

/** "TOR 4.2.1" or "เพิ่มเติม" */
export const originLabel = (r: Pick<Requirement, 'origin' | 'torClause'>) =>
  r.origin === 'tor' ? `TOR ${r.torClause ?? ''}`.trim() : requirementOriginOf(r.origin).label

export const coverageOf = (v: CoverageStatus) => COVERAGE.find((c) => c.value === v) ?? COVERAGE[0]

// --- reading requirements from a spreadsheet (the import wizard) ---------------------------------

/** the cells of one row, by field (empty: no column or no value) */
export type RequirementCells = Record<
  'code' | 'origin' | 'torClause' | 'title' | 'description' | 'acceptanceCriteria' | 'type' | 'priority' | 'status' | 'source',
  string
>

const typeFromText = (v: string): RequirementType =>
  /non|ประสิทธิภาพ|ความปลอดภัย|performance|security|nfr/i.test(v) ? 'non_functional' : /rule|กฎ|business/i.test(v) ? 'business_rule' : 'functional'

const statusFromText = (v: string): RequirementStatus =>
  /approv|อนุมัติ/i.test(v) ? 'approved' : /chang|เปลี่ยน/i.test(v) ? 'changed' : /deprecat|cancel|ยกเลิก/i.test(v) ? 'deprecated' : 'draft'

/** "tor", "TOR", "ตาม TOR" -> tor; "เพิ่มเติม", "additional", "CR" -> additional; no column: a clause means TOR */
const originFromText = (v: string, clause: string): RequirementOrigin =>
  v ? (/tor/i.test(v) && !/เพิ่ม|add/i.test(v) ? 'tor' : 'additional') : clause ? 'tor' : 'additional'

/** one requirement from a row; acceptance criteria are one per line (or separated by ";") */
export function requirementFromCells(c: RequirementCells): RequirementImportRow {
  const clause = c.torClause.trim()
  const origin = originFromText(c.origin.trim(), clause)
  return {
    ...(c.code.trim() && { code: c.code.trim() }),
    title: c.title.trim(),
    description: c.description.trim(),
    acceptanceCriteria: c.acceptanceCriteria
      .split(/\r?\n|;/)
      .map((l) => l.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter(Boolean),
    type: typeFromText(c.type),
    priority: priorityFromText(c.priority),
    status: statusFromText(c.status),
    origin,
    ...(origin === 'tor' && clause && { torClause: clause }),
    source: c.source.trim(),
  }
}
