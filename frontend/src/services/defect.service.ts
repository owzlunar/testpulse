import type { Defect, DefectComment, DefectInput, DefectSeverity, DefectStatus, Option } from '@/types'
import { addDays, todayISO } from '@/utils/date'
import { ApiError, respond } from './http'
import { STORAGE_KEYS, load, save } from './storage.service'

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
/** still affects a release */
export const isOpenDefect = (d: Defect) => !['closed', 'rejected'].includes(d.status)

const day = (n: number) => `${addDays(todayISO(), n)}T09:00:00Z`
const SEED_DEFECTS: Defect[] = [
  {
    id: 'BUG-001', projectId: 'proj-1', title: 'Webhook ซ้ำพร้อมกันทำให้บันทึกรายการชำระเงินซ้ำ', severity: 'critical', status: 'retest',
    description: 'เมื่อธนาคารส่ง callback เดิมพร้อมกันหลาย request ระบบสร้าง transaction ซ้ำ',
    stepsToReproduce: '1. ชำระเงินสำเร็จ 1 รายการ\n2. ยิง Webhook payment.success เดิม 10 request พร้อมกันด้วย k6\n3. ตรวจตาราง transactions',
    expected: 'มีรายการเดียว', actual: 'มี 2 รายการ ยอดถูกบันทึกซ้ำ',
    caseId: 'TC-103', runId: 'run-1', stepNumber: 2, assignee: 'กิตติศักดิ์ พัฒนา (Dev Lead)', reportedBy: 'สมชาย ประเสริฐ (QA Lead)',
    externalKey: 'PAY-482', environment: 'Staging · v3.2.0-rc1', evidence: [],
    comments: [
      { by: 'กิตติศักดิ์ พัฒนา (Dev Lead)', at: day(-6), text: 'เพิ่ม Distributed lock ด้วย Redis แล้ว deploy ใน rc2' },
      { by: 'สมชาย ประเสริฐ (QA Lead)', at: day(-2), text: 'รอทดสอบซ้ำในรอบ Regression' },
    ],
    createdAt: day(-8), updatedAt: day(-2),
  },
  {
    id: 'BUG-002', projectId: 'proj-1', title: 'ข้อความ Error ไม่บอกเวลาที่ QR หมดอายุ', severity: 'minor', status: 'open',
    description: 'หน้าจอ QR หมดอายุแสดงแค่ "ทำรายการไม่สำเร็จ"', stepsToReproduce: '1. สร้าง QR\n2. รอ 15 นาที\n3. ดูหน้าจอ',
    expected: 'แสดง "QR หมดอายุ กรุณาสร้างใหม่"', actual: 'แสดง "ทำรายการไม่สำเร็จ"',
    caseId: 'TC-101-1', assignee: 'ธนากร สุขใจ (Backend API)', reportedBy: 'พิชญา ศรีสุข (Senior Tester)', environment: 'Staging', evidence: [], comments: [],
    createdAt: day(-5), updatedAt: day(-5),
  },
  {
    id: 'BUG-003', projectId: 'proj-1', title: 'DLQ ไม่ได้รับข้อความหลัง Retry ครบ 5 ครั้ง', severity: 'major', status: 'in_progress',
    description: 'ข้อความที่ retry ครบหายไปแทนที่จะเข้า Dead Letter Queue', stepsToReproduce: '1. ปิด endpoint ปลายทาง\n2. ส่ง Webhook\n3. รอ retry ครบ',
    expected: 'ข้อความอยู่ใน DLQ', actual: 'ไม่พบข้อความ', caseId: 'TC-104', assignee: 'ธนากร สุขใจ (Backend API)',
    reportedBy: 'สมชาย ประเสริฐ (QA Lead)', externalKey: 'PAY-490', environment: 'Staging', evidence: [], comments: [], createdAt: day(-4), updatedAt: day(-1),
  },
  {
    id: 'BUG-004', projectId: 'proj-1', title: 'ปุ่มดาวน์โหลดใบเสร็จตัดคำภาษาไทย', severity: 'trivial', status: 'closed',
    description: 'ข้อความบนปุ่มถูกตัดบนมือถือ', stepsToReproduce: 'เปิดหน้าใบเสร็จบน iPhone SE', expected: 'ข้อความครบ', actual: 'ถูกตัด',
    reportedBy: 'พิชญา ศรีสุข (Senior Tester)', evidence: [], comments: [], createdAt: day(-12), updatedAt: day(-9),
  },
]

// --- API ------------------------------------------------------------------------
const defects = () => load(STORAGE_KEYS.defects, SEED_DEFECTS)

/** server-side: follow renumbered case ids (old id -> new id) in the project's defects */
export function renameDefectCases(projectId: string, renames: Record<string, string>) {
  const list = defects()
  list.forEach((d) => {
    if (d.projectId === projectId && d.caseId) d.caseId = renames[d.caseId] ?? d.caseId
  })
  save(STORAGE_KEYS.defects, list)
}

/** GET /defects */
export const fetchDefects = () => respond(defects)

/** POST /projects/:projectId/defects · PUT /defects/:id */
export const saveDefect = (input: DefectInput, reportedBy: string) =>
  respond(() => {
    const list = defects()
    const now = new Date().toISOString()
    if (input.id) {
      const i = list.findIndex((d) => d.id === input.id)
      if (i < 0) throw new ApiError('ไม่พบ Defect', 404)
      list[i] = { ...list[i], ...input, id: input.id, updatedAt: now }
      save(STORAGE_KEYS.defects, list)
      return list[i]
    }
    const next = list.reduce((m, d) => Math.max(m, Number(d.id.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1
    const created: Defect = { ...input, id: `BUG-${String(next).padStart(3, '0')}`, reportedBy, comments: [], createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.defects, [created, ...list])
    return created
  })

/** POST /defects/:id/comments */
export const addDefectComment = (id: string, comment: DefectComment) =>
  respond(() => {
    const list = defects()
    const d = list.find((x) => x.id === id)
    if (!d) throw new ApiError('ไม่พบ Defect', 404)
    d.comments.push(comment)
    d.updatedAt = comment.at
    save(STORAGE_KEYS.defects, list)
    return d
  })
