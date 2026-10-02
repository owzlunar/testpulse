import type { Option, PermissionKey, RoleDiscipline, Tone } from '@/types'

// Role groups and the permission catalog. Users without a role see only the dashboard and settings;
// managing users, roles, teams and projects belongs to the built-in Admin role and is not grantable.

export const PERMISSION_GROUPS: { module: string; icon: string; items: { key: PermissionKey; label: string; description: string }[] }[] = [
  {
    module: 'Requirements',
    icon: 'tabler:clipboard-list',
    items: [
      { key: 'requirement.view', label: 'ดู Requirement', description: 'เปิดหน้า Requirements และ Traceability Matrix' },
      { key: 'requirement.edit', label: 'สร้าง / แก้ไข', description: 'เพิ่มและแก้ Requirement (เคสที่ผูกไว้จะถูกแจ้งให้ทบทวน)' },
      { key: 'requirement.delete', label: 'ลบ', description: 'ลบ Requirement ออกจากระบบ' },
    ],
  },
  {
    module: 'Test Cases',
    icon: 'tabler:flask',
    items: [
      { key: 'case.view', label: 'ดู Test Case', description: 'เปิดหน้า Test Cases และดูรายละเอียด' },
      { key: 'case.edit', label: 'สร้าง / แก้ไข', description: 'สร้าง นำเข้า แก้ไขข้อกำหนดและขั้นตอน ทำสำเนา และบันทึกว่าทบทวนแล้ว' },
      { key: 'case.archive', label: 'เก็บเข้าคลัง / กู้คืน', description: 'ซ่อนเคสจากการใช้งาน และกู้คืนจากคลัง' },
      { key: 'case.delete', label: 'ลบถาวร', description: 'ลบเคสในคลังออกจากระบบ (กู้คืนไม่ได้)' },
      { key: 'case.reorder', label: 'จัดลำดับ', description: 'ลากหรือย้ายตำแหน่งเคส ระบบจะรันรหัสใหม่' },
      { key: 'case.restoreVersion', label: 'กู้คืนเวอร์ชัน', description: 'นำเนื้อหาของเวอร์ชันก่อนหน้ากลับมาเป็นเวอร์ชันใหม่' },
      { key: 'case.handoff', label: 'ส่งมอบพร้อมเทส', description: 'เปลี่ยนสถานะเป็น Ready for Test เพื่อส่งต่อให้ QA' },
    ],
  },
  {
    module: 'รอบการทดสอบ',
    icon: 'tabler:player-play',
    items: [
      { key: 'run.view', label: 'ดูรอบการทดสอบ', description: 'เปิดรายการรอบและผลการทดสอบ' },
      { key: 'run.create', label: 'สร้างรอบ', description: 'สร้างรอบการทดสอบใหม่และเลือกเคส' },
      { key: 'run.execute', label: 'บันทึกผล', description: 'ตัดสินผล Passed / Failed / Blocked และแนบหลักฐาน' },
      { key: 'run.close', label: 'ปิดรอบ', description: 'ปิดรอบการทดสอบ (แก้ผลไม่ได้อีก)' },
    ],
  },
  {
    module: 'Defects',
    icon: 'tabler:bug',
    items: [
      { key: 'defect.view', label: 'ดู Defect', description: 'เปิดหน้า Defects' },
      { key: 'defect.report', label: 'รายงาน / แก้ไข', description: 'รายงาน Defect ใหม่ แก้ไข แสดงความเห็น และอัปเดตความคืบหน้า' },
      { key: 'defect.resolve', label: 'ปิด / ปฏิเสธ', description: 'ปิด Defect หลังทดสอบซ้ำผ่าน หรือปฏิเสธ' },
    ],
  },
  {
    module: 'ปฏิทิน',
    icon: 'tabler:calendar-event',
    items: [{ key: 'calendar.view', label: 'ดูปฏิทินงานทดสอบ', description: 'เปิดปฏิทิน กำหนดส่ง และ Milestone' }],
  },
  {
    module: 'เอกสาร',
    icon: 'tabler:files',
    items: [
      { key: 'document.view', label: 'ดูเอกสาร', description: 'เปิดศูนย์เอกสารและดาวน์โหลด' },
      { key: 'document.create', label: 'สร้างเอกสาร UAT', description: 'ออกเอกสารตรวจรับ UAT และรายงานทางการ' },
      { key: 'document.sign', label: 'อนุมัติ / ลงนาม', description: 'ลงนามหรือปฏิเสธเอกสารที่รอลงนาม' },
    ],
  },
  {
    module: 'รายงาน',
    icon: 'tabler:report-analytics',
    items: [{ key: 'report.view', label: 'ดูรายงาน', description: 'เปิดหน้ารายงานและสถิติ' }],
  },
  {
    module: 'การแจ้งเตือน',
    icon: 'tabler:bell',
    items: [{ key: 'notification.receive', label: 'รับการแจ้งเตือน', description: 'เห็นกระดิ่งและได้รับการแจ้งเตือนในระบบ' }],
  },
  {
    module: 'ผู้ดูแลระบบ',
    icon: 'tabler:shield-lock',
    items: [{ key: 'audit.view', label: 'ดู Audit Logs', description: 'เรียกดูประวัติการกระทำทั้งหมดในระบบ' }],
  },
]

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))

export const permissionOf = (key: PermissionKey) => PERMISSION_GROUPS.flatMap((g) => g.items).find((i) => i.key === key)

export const DISCIPLINES: Option<RoleDiscipline>[] = [
  { value: 'qa', label: 'QA', hint: 'อยู่ในรายชื่อ QA ผู้รับผิดชอบ และเห็นงานฝั่งทดสอบ', tone: 'success', icon: 'tabler:flask' },
  { value: 'dev', label: 'Developer', hint: 'อยู่ในรายชื่อ Developer ผู้รับผิดชอบ และเห็นงานฝั่งแก้ไข', tone: 'info', icon: 'tabler:code' },
  { value: 'other', label: 'อื่นๆ', hint: 'ไม่อยู่ในรายชื่อผู้รับผิดชอบ เช่น PM หรือผู้บริหาร', tone: 'secondary', icon: 'tabler:briefcase' },
]

/** colours and icons a role can pick (theme tones only) */
export const ROLE_TONES: Tone[] = ['primary', 'secondary', 'info', 'success', 'warning', 'caution', 'error']

export const ROLE_ICONS = [
  'tabler:user-shield',
  'tabler:crown',
  'tabler:flask',
  'tabler:checklist',
  'tabler:code',
  'tabler:bug',
  'tabler:briefcase',
  'tabler:chart-bar',
  'tabler:eye',
  'tabler:user',
]

/** how a user without a role is shown */
export const NO_ROLE: Option<'none'> = {
  value: 'none',
  label: 'ยังไม่มี Role',
  hint: 'เห็นเฉพาะภาพรวมและตั้งค่า',
  tone: 'secondary',
  icon: 'tabler:user-question',
}

export const ADMIN_ROLE_ID = 'role-admin'
