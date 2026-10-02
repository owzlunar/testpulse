import type { DocumentStatus, DocumentTemplate, DocumentType, Option, UatDecision } from '@/types'
import { todayISO } from '@/utils/date'

export const DOCUMENT_TYPES: (Option<DocumentType> & { description: string; code: string })[] = [
  {
    value: 'uat',
    code: 'UAT',
    label: 'UAT Sign-off',
    hint: 'เอกสารตรวจรับระบบ',
    icon: 'tabler:certificate',
    tone: 'success',
    description: 'สรุปผลการตรวจรับ มติ (ผ่าน / มีเงื่อนไข / ไม่ผ่าน) Defect ที่ค้าง และช่องลงนามผู้ส่งมอบและผู้รับมอบ',
  },
  {
    value: 'test_summary',
    code: 'TSR',
    label: 'Test Summary Report',
    hint: 'รายงานผลรอบการทดสอบ',
    icon: 'tabler:report-analytics',
    tone: 'primary',
    description: 'ผลของรอบทดสอบ: Pass rate, ผลรายเคส, Defect ที่พบ และรายละเอียดเคสที่ไม่ผ่านพร้อมหลักฐาน',
  },
  {
    value: 'test_spec',
    code: 'TSP',
    label: 'Test Specification',
    hint: 'เอกสารกรณีทดสอบ',
    icon: 'tabler:file-description',
    tone: 'info',
    description: 'รายละเอียด Test Case ทั้งหมด: Requirement, Scenario, Prerequisite และตารางขั้นตอน ใช้ส่งให้ลูกค้าตรวจก่อนทดสอบ',
  },
  {
    value: 'rtm',
    code: 'RTM',
    label: 'Traceability Matrix',
    hint: 'ตารางความครอบคลุม',
    icon: 'tabler:table',
    tone: 'warning',
    description: 'ตาราง Requirement ↔ Test Case พร้อมสถานะความครอบคลุม ใช้ยืนยันว่าทุก Requirement ถูกทดสอบ',
  },
]

export const DOCUMENT_STATUSES: Option<DocumentStatus>[] = [
  { value: 'draft', label: 'ฉบับร่าง', tone: 'secondary', icon: 'tabler:pencil' },
  { value: 'pending_signoff', label: 'รอลงนาม', tone: 'warning', icon: 'tabler:signature' },
  { value: 'signed', label: 'ลงนามครบแล้ว', tone: 'success', icon: 'tabler:rosette-discount-check' },
  { value: 'rejected', label: 'ถูกปฏิเสธ', tone: 'error', icon: 'tabler:circle-x' },
]

export const UAT_DECISIONS: (Option<UatDecision> & { full: string })[] = [
  { value: 'accepted', label: 'ผ่านการตรวจรับ', full: 'FULL ACCEPTANCE (ผ่านการตรวจรับสมบูรณ์)', tone: 'success', icon: 'tabler:circle-check' },
  {
    value: 'conditional',
    label: 'ผ่านแบบมีเงื่อนไข',
    full: 'CONDITIONAL ACCEPTANCE (รับมอบแบบมีเงื่อนไข)',
    tone: 'warning',
    icon: 'tabler:alert-triangle',
  },
  { value: 'rejected', label: 'ไม่ผ่านการตรวจรับ', full: 'REJECTED (ไม่ผ่านการตรวจรับ)', tone: 'error', icon: 'tabler:circle-x' },
]

export const documentTypeOf = (v: DocumentType) => DOCUMENT_TYPES.find((t) => t.value === v) ?? DOCUMENT_TYPES[0]

export const documentStatusOf = (v: DocumentStatus) => DOCUMENT_STATUSES.find((s) => s.value === v) ?? DOCUMENT_STATUSES[0]

export const uatDecisionOf = (v: UatDecision) => UAT_DECISIONS.find((d) => d.value === v) ?? UAT_DECISIONS[0]

export const DEFAULT_TEMPLATE: DocumentTemplate = {
  companyName: 'บริษัท เทสต์พัลส์ เทคโนโลยี จำกัด',
  companyAddress: '999 อาคารดิจิทัล ชั้น 12 ถนนพระราม 9 กรุงเทพฯ 10310',
  logo: '',
  docNumberPattern: '{TYPE}-{KEY}-{YYYYMMDD}-{NN}',
  headerNote: 'เอกสารนี้จัดทำโดยระบบ TestPulse จากผลการทดสอบจริงในระบบ',
  footerNote: 'เอกสารภายใน · ห้ามเผยแพร่โดยไม่ได้รับอนุญาต',
  defaultSignatories: [
    { role: 'ผู้จัดทำ (ผู้ส่งมอบ)', position: 'QA Lead' },
    { role: 'ผู้ตรวจสอบ', position: 'Project Manager' },
    { role: 'ผู้อนุมัติ (ผู้รับมอบ)', position: 'Product Owner' },
  ],
}

/** "{TYPE}-{KEY}-{YYYYMMDD}-{NN}" -> "UAT-PAY-20261001-01" */
export function formatDocNumber(pattern: string, type: DocumentType, key: string, seq: number): string {
  return pattern
    .replace('{TYPE}', documentTypeOf(type).code)
    .replace('{KEY}', key)
    .replace('{YYYYMMDD}', todayISO().replace(/-/g, ''))
    .replace('{YYYY}', todayISO().slice(0, 4))
    .replace('{NN}', String(seq).padStart(2, '0'))
}
