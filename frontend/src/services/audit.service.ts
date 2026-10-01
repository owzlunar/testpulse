import type { AuditAction, AuditTrailEntry, Option } from '@/types'
import { respond } from './http'
import { STORAGE_KEYS, load, update } from './storage.service'

export const AUDIT_ACTIONS: Option<AuditAction>[] = [
  { value: 'CREATE', label: 'สร้างข้อมูล', tone: 'primary', icon: 'tabler:plus' },
  { value: 'UPDATE', label: 'แก้ไขข้อมูล', tone: 'info', icon: 'tabler:pencil' },
  { value: 'STATUS_CHANGE', label: 'เปลี่ยนสถานะ', tone: 'success', icon: 'tabler:arrows-exchange' },
  { value: 'ADD_SUBCASE', label: 'เพิ่ม Sub-case', tone: 'secondary', icon: 'tabler:subtask' },
  { value: 'EXTEND_DUE_DATE', label: 'ขยายกำหนดส่ง', tone: 'warning', icon: 'tabler:calendar-time' },
  { value: 'SLA_BREACHED', label: 'เลยกำหนด SLA', tone: 'caution', icon: 'tabler:clock-exclamation' },
  { value: 'EXPORT', label: 'ส่งออกเอกสาร', tone: 'warning', icon: 'tabler:download' },
  { value: 'DELETE', label: 'ลบข้อมูล', tone: 'error', icon: 'tabler:trash' },
]

export const auditActionOf = (action: AuditAction): Option<AuditAction> =>
  AUDIT_ACTIONS.find((a) => a.value === action) ?? AUDIT_ACTIONS[1]

const SEED_AUDIT_LOGS: AuditTrailEntry[] = [
  {
    id: 'aud-1',
    timestamp: '2026-09-30T10:15:00Z',
    userId: 'user-1',
    userName: 'Somchai Prasert',
    userRole: 'QA Lead',
    action: 'STATUS_CHANGE',
    targetType: 'TEST_CASE',
    targetId: 'TC-101',
    targetTitle: 'สร้าง Dynamic PromptPay QR Code และยืนยันการชำระเงินสำเร็จ',
    details: 'เปลี่ยนสถานะจาก "in_progress" เป็น "passed" พร้อมแนบภาพหลักฐานผลการทดสอบจริง',
    changes: [
      { field: 'status', oldValue: 'in_progress', newValue: 'passed' },
      { field: 'actualResults', oldValue: '', newValue: 'ระบบทำงานได้สมบูรณ์ตามเกณฑ์ ทุกขั้นตอนผ่านฉลุย Response Time เฉลี่ย 230ms' },
    ]
  },
  {
    id: 'aud-2',
    timestamp: '2026-09-30T09:00:00Z',
    userId: 'user-3',
    userName: 'Alex Chen',
    userRole: 'Automation Engineer',
    action: 'STATUS_CHANGE',
    targetType: 'TEST_CASE',
    targetId: 'TC-103',
    targetTitle: 'Concurrency & Idempotency Test สำหรับ Bank Callback',
    details: 'รัน k6 automated concurrency test แล้วพบ Bug Race Condition ปรับสถานะเป็น "failed"',
    changes: [
      { field: 'status', oldValue: 'untested', newValue: 'failed' },
    ]
  },
  {
    id: 'aud-3',
    timestamp: '2026-09-29T14:20:00Z',
    userId: 'user-2',
    userName: 'Pitchaya Srisuk',
    userRole: 'Senior QA Tester',
    action: 'ADD_SUBCASE',
    targetType: 'TEST_CASE',
    targetId: 'TC-101-1',
    targetTitle: '[Sub-case] ตรวจสอบระบบปฏิเสธการชำระเงินเมื่อ QR Code เกินเวลา 15 นาที',
    details: 'สร้าง Sub-test case ย่อยภายใต้ TC-101 เพื่อครอบคลุมเงื่อนไข Expiration Timeout',
  },
  {
    id: 'aud-4',
    timestamp: '2026-09-28T08:00:00Z',
    userId: 'user-2',
    userName: 'Pitchaya Srisuk',
    userRole: 'Senior QA Tester',
    action: 'CREATE',
    targetType: 'PROJECT',
    targetId: 'proj-2',
    targetTitle: 'Omnichannel SuperApp E-Commerce',
    details: 'สร้างโปรเจกต์ใหม่และนำเข้าข้อกำหนดจาก PRD Sprint 42',
  },
]

// --- API ------------------------------------------------------------------------
/**
 * server-side: point the project's case entries at the renumbered ids so each case keeps its own history.
 * Entries saved before audit logs carried a projectId can't be told apart across projects and stay as they are.
 */
export function renameAuditCases(projectId: string, renames: Record<string, string>) {
  update(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS, (logs) =>
    logs.forEach((l) => {
      if (l.targetType === 'TEST_CASE' && l.projectId === projectId && !l.targetDeleted) l.targetId = renames[l.targetId] ?? l.targetId
    }),
  )
}

/** server-side: entries of deleted cases stay in the trail but no longer belong to the (reusable) id */
export function detachAuditCases(projectId: string, caseIds: string[]) {
  update(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS, (logs) =>
    logs.forEach((l) => {
      if (l.targetType === 'TEST_CASE' && l.projectId === projectId && caseIds.includes(l.targetId)) l.targetDeleted = true
    }),
  )
}

/** GET /audit-logs */
export const fetchAuditLogs = () => respond(() => load(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS))

/** POST /audit-logs (on the real backend the server writes these itself) */
export const createAuditLog = (entry: AuditTrailEntry) =>
  respond(() => {
    update(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS, (logs) => [entry, ...logs])
    return entry
  }, 50)
