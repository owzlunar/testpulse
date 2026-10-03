import type { CoverageStatus, Option, RequirementStatus, RequirementType } from '@/types'

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
