import type { DefectSeverity, DefectStatus, Option } from '@/types'

// Rules the backend shares (what counts as open) live in ./rules/defect.ts
export * from './rules/defect'

export const SEVERITIES: Option<DefectSeverity>[] = [
  { value: 'critical', label: 'Critical', hint: 'ระบบใช้งานไม่ได้ / ข้อมูลเสียหาย', tone: 'error', icon: 'tabler:alert-octagon' },
  { value: 'major', label: 'Major', hint: 'ฟังก์ชันหลักผิดพลาด', tone: 'caution', icon: 'tabler:alert-triangle' },
  { value: 'minor', label: 'Minor', hint: 'มีทางเลี่ยง', tone: 'warning', icon: 'tabler:alert-circle' },
  { value: 'trivial', label: 'Trivial', hint: 'ความสวยงาม / ข้อความ', tone: 'secondary', icon: 'tabler:info-circle' },
]

// Dev fixes -> QA re-tests -> closed (or back to open)
export const DEFECT_STATUSES: Option<DefectStatus>[] = [
  { value: 'open', label: 'Open', hint: 'รอ Dev รับงาน', tone: 'error', icon: 'tabler:bug' },
  { value: 'in_progress', label: 'In Progress', hint: 'Dev กำลังแก้', tone: 'primary', icon: 'tabler:code' },
  { value: 'fixed', label: 'Fixed', hint: 'แก้แล้ว รอ Deploy', tone: 'info', icon: 'tabler:tool' },
  { value: 'retest', label: 'Retest', hint: 'รอ QA ทดสอบซ้ำ', tone: 'warning', icon: 'tabler:refresh' },
  { value: 'closed', label: 'Closed', hint: 'ยืนยันแล้ว', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'rejected', label: 'Rejected', hint: 'ไม่ใช่ Bug / ซ้ำ', tone: 'secondary', icon: 'tabler:circle-minus' },
]

export const severityOf = (v: DefectSeverity) => SEVERITIES.find((s) => s.value === v) ?? SEVERITIES[2]

export const defectStatusOf = (v: DefectStatus) => DEFECT_STATUSES.find((s) => s.value === v) ?? DEFECT_STATUSES[0]
