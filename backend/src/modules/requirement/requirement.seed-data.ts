// Demo data (the same as the web app's mock: frontend/src/api/mock/seeds/requirements.seed.ts)
import type { Requirement, RequirementStatus, RequirementType } from '#contract/types.js'

const at = '2026-09-15T09:00:00Z'
/** the demo requirements that come from a TOR clause; the rest were added on top of it */
const TOR_CLAUSES: Record<string, string> = {
  'REQ-PAY-01': '4.1.1',
  'REQ-PAY-02': '4.1.2',
  'REQ-PAY-04': '4.2.1',
  'REQ-PAY-05': '4.3',
  'REQ-SHOP-01': '3.2.1',
  'REQ-AUTH-01': '5.1',
}
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
  ...(TOR_CLAUSES[code] ? { origin: 'tor' as const, torClause: TOR_CLAUSES[code] } : { origin: 'additional' as const }),
  source,
  acceptanceCriteria,
  createdAt: at,
  updatedAt: at,
})

export const SEED_REQUIREMENTS: Requirement[] = [
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
