import type { AuditAction, Option } from '@/types'

export const AUDIT_ACTIONS: Option<AuditAction>[] = [
  { value: 'CREATE', label: 'สร้างข้อมูล', tone: 'primary', icon: 'tabler:plus' },
  { value: 'UPDATE', label: 'แก้ไขข้อมูล', tone: 'info', icon: 'tabler:pencil' },
  { value: 'STATUS_CHANGE', label: 'เปลี่ยนสถานะ', tone: 'success', icon: 'tabler:arrows-exchange' },
  { value: 'ADD_SUBCASE', label: 'เพิ่ม Sub-case', tone: 'secondary', icon: 'tabler:subtask' },
  { value: 'EXTEND_DUE_DATE', label: 'ขยายกำหนดส่ง', tone: 'warning', icon: 'tabler:calendar-time' },
  { value: 'SLA_BREACHED', label: 'เลยกำหนด SLA', tone: 'caution', icon: 'tabler:clock-exclamation' },
  { value: 'EXPORT', label: 'ส่งออกเอกสาร', tone: 'warning', icon: 'tabler:download' },
  { value: 'ARCHIVE', label: 'เก็บเข้าคลัง', tone: 'secondary', icon: 'tabler:archive' },
  { value: 'RESTORE', label: 'กู้คืนจากคลัง', tone: 'success', icon: 'tabler:archive-off' },
  { value: 'DELETE', label: 'ลบข้อมูล', tone: 'error', icon: 'tabler:trash' },
]

export const auditActionOf = (action: AuditAction): Option<AuditAction> => AUDIT_ACTIONS.find((a) => a.value === action) ?? AUDIT_ACTIONS[1]
