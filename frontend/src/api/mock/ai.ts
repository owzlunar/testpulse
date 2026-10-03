import type { AiStatus, DraftOptions, StepDraft, TestCaseDraft } from '@/types'
import { respond } from './http'

// A stand-in for the language model: picks a scenario pack by keyword so the review UI shows
// realistic, domain-specific drafts (the backend asks a local model, Ollama)

/** GET /ai/status */
export const fetchAiStatus = () => respond((): AiStatus => ({ enabled: true, model: 'mock' }))

const s = (action: string, testData: string, expectedResult: string): StepDraft => ({ action, testData, expectedResult })

interface Pack {
  match: RegExp
  positive: Omit<TestCaseDraft, 'requirement' | 'kind'>[]
  negative: Omit<TestCaseDraft, 'requirement' | 'kind'>[]
  boundary: Omit<TestCaseDraft, 'requirement' | 'kind'>[]
}

const PACKS: Pack[] = [
  {
    match: /qr|promptpay|ชำระ|payment|โอน|gateway|บัตร/i,
    positive: [
      {
        name: 'สร้าง QR และชำระเงินสำเร็จ',
        testScenario: 'ลูกค้าชำระเงินด้วย QR ตามยอดที่ระบุ',
        priority: 'critical',
        prerequisite: 'Merchant เปิดใช้งาน PromptPay และ Sandbox ธนาคารพร้อมส่ง Webhook',
        steps: [
          s('สร้างคำสั่งซื้อและเลือกชำระด้วย QR', 'ยอด 1,500.00 THB', 'แสดง QR พร้อมยอดเงินและเวลาหมดอายุ'),
          s('สแกนและยืนยันการโอนในแอปธนาคาร', 'Sandbox account', 'แอปแสดงชื่อร้านและยอดถูกต้อง'),
          s('รอ Webhook จากธนาคาร', 'event: payment.success', 'สถานะคำสั่งซื้อเปลี่ยนเป็น PAID ภายใน 2 วินาที'),
        ],
        expectedResults: 'คำสั่งซื้อเป็น PAID และลูกค้าได้รับใบเสร็จ',
      },
    ],
    negative: [
      {
        name: 'ปฏิเสธการชำระเมื่อ QR หมดอายุ',
        testScenario: 'สแกน QR หลังพ้นเวลาที่กำหนด',
        priority: 'high',
        prerequisite: 'QR ที่สร้างไว้นานกว่า 15 นาที',
        steps: [
          s('สร้าง QR แล้วรอจนหมดอายุ', 'รอ 15 นาที', 'หน้าจอแสดง QR หมดอายุ'),
          s('สแกนและพยายามโอน', 'QR เดิม', 'ธนาคารปฏิเสธรายการ และคำสั่งซื้อไม่ถูกเปลี่ยนสถานะ'),
        ],
        expectedResults: 'ไม่มีการตัดเงิน และแสดงปุ่มสร้าง QR ใหม่',
      },
      {
        name: 'ไม่บันทึกรายการซ้ำเมื่อได้รับ Webhook ซ้ำ',
        testScenario: 'ธนาคารส่ง callback เดิมซ้ำพร้อมกัน',
        priority: 'critical',
        prerequisite: 'คำสั่งซื้อที่ชำระสำเร็จแล้ว และเครื่องมือยิง request พร้อมกัน (k6/JMeter)',
        steps: [
          s('ยิง Webhook เดิม 10 ครั้งพร้อมกัน', 'txRef เดียวกัน', 'ทุก request ตอบ 200'),
          s('ตรวจสอบตาราง transaction', '-', 'มีรายการเดียว ยอดไม่ซ้ำ'),
        ],
        expectedResults: 'ระบบ Idempotent ไม่มี Double spending',
      },
    ],
    boundary: [
      {
        name: 'ยอดชำระขั้นต่ำและสูงสุด',
        testScenario: 'สร้าง QR ด้วยยอดที่ขอบเขต',
        priority: 'medium',
        prerequisite: 'ทราบเพดานยอดต่อรายการของ Merchant',
        steps: [
          s('สร้าง QR ยอดต่ำสุด', '0.01 THB', 'สร้างได้'),
          s('สร้าง QR ยอด 0', '0.00 THB', 'ปฏิเสธพร้อมข้อความ'),
          s('สร้าง QR เกินเพดาน', 'เพดาน + 0.01', 'ปฏิเสธพร้อมข้อความ'),
        ],
        expectedResults: 'รับเฉพาะยอดในช่วงที่อนุญาต',
      },
    ],
  },
  {
    match: /login|เข้าสู่ระบบ|sso|oauth|รหัสผ่าน|password|otp|2fa|mfa/i,
    positive: [
      {
        name: 'เข้าสู่ระบบด้วยข้อมูลถูกต้อง',
        testScenario: 'ผู้ใช้ที่ลงทะเบียนแล้วเข้าสู่ระบบสำเร็จ',
        priority: 'critical',
        prerequisite: 'มีบัญชีที่ยืนยันแล้ว',
        steps: [
          s('เปิดหน้าเข้าสู่ระบบ', '/login', 'แสดงฟอร์ม'),
          s('กรอกข้อมูลถูกต้องแล้วยืนยัน', 'user@example.com / P@ssw0rd', 'เข้าสู่หน้าหลัก'),
          s('ตรวจสอบ Session', 'DevTools > Cookies', 'มี Session cookie แบบ HttpOnly, Secure'),
        ],
        expectedResults: 'เข้าสู่ระบบได้และ Session ปลอดภัย',
      },
    ],
    negative: [
      {
        name: 'รหัสผ่านผิดเกินจำนวนครั้งแล้วถูกล็อก',
        testScenario: 'กรอกรหัสผ่านผิดติดกัน',
        priority: 'high',
        prerequisite: 'ทราบเกณฑ์ล็อกบัญชี',
        steps: [
          s('กรอกรหัสผ่านผิด 5 ครั้ง', 'wrong-pass', 'แสดงข้อความทั่วไป ไม่ระบุว่าช่องไหนผิด'),
          s('กรอกรหัสผ่านถูกระหว่างล็อก', 'P@ssw0rd', 'ยังเข้าไม่ได้ และแจ้งเวลาที่ลองใหม่ได้'),
        ],
        expectedResults: 'บัญชีถูกล็อกตามนโยบาย',
      },
      {
        name: 'OTP หมดอายุหรือไม่ถูกต้อง',
        testScenario: 'กรอก OTP ผิดหรือหลังหมดเวลา',
        priority: 'high',
        prerequisite: 'บัญชีที่เปิด 2FA',
        steps: [s('กรอก OTP ผิด', '000000', 'แจ้ง OTP ไม่ถูกต้อง'), s('กรอก OTP หลัง 5 นาที', 'OTP เดิม', 'แจ้ง OTP หมดอายุ และให้ขอใหม่')],
        expectedResults: 'เข้าสู่ระบบไม่ได้หากไม่ผ่าน OTP',
      },
    ],
    boundary: [
      {
        name: 'ความยาวรหัสผ่านต่ำสุดและสูงสุด',
        testScenario: 'ตั้งรหัสผ่านที่ขอบเขตนโยบาย',
        priority: 'medium',
        prerequisite: 'นโยบายรหัสผ่าน 8–64 ตัวอักษร',
        steps: [
          s('ตั้งรหัสผ่าน 7 ตัว', 'Abc@123', 'ปฏิเสธ'),
          s('ตั้งรหัสผ่าน 8 ตัว', 'Abc@1234', 'ยอมรับ'),
          s('ตั้งรหัสผ่าน 65 ตัว', '65 ตัวอักษร', 'ปฏิเสธ'),
        ],
        expectedResults: 'บังคับใช้นโยบายรหัสผ่านถูกต้อง',
      },
    ],
  },
  {
    match: /ตะกร้า|cart|flash ?sale|สินค้า|order|คำสั่งซื้อ|stock|สต็อก/i,
    positive: [
      {
        name: 'เพิ่มสินค้าลงตะกร้าและสั่งซื้อ',
        testScenario: 'ลูกค้าเลือกสินค้าและชำระเงิน',
        priority: 'critical',
        prerequisite: 'สินค้ามีสต็อก และผู้ใช้เข้าสู่ระบบแล้ว',
        steps: [
          s('เพิ่มสินค้าลงตะกร้า', 'SKU-001 x2', 'ตะกร้าแสดงจำนวนและราคารวมถูกต้อง'),
          s('ไปหน้าชำระเงินและยืนยัน', 'ที่อยู่จัดส่งตัวอย่าง', 'สร้างคำสั่งซื้อสำเร็จ'),
          s('ตรวจสอบสต็อก', '-', 'สต็อกลดลง 2 ชิ้น'),
        ],
        expectedResults: 'คำสั่งซื้อถูกสร้างและสต็อกถูกต้อง',
      },
    ],
    negative: [
      {
        name: 'สั่งซื้อพร้อมกันเกินจำนวนสต็อก',
        testScenario: 'ผู้ใช้หลายคนซื้อสินค้าชิ้นสุดท้ายพร้อมกัน',
        priority: 'critical',
        prerequisite: 'สินค้าเหลือ 1 ชิ้น และ 2 บัญชีทดสอบ',
        steps: [s('ทั้งสองบัญชีกดสั่งซื้อพร้อมกัน', 'SKU-001 x1', 'สำเร็จเพียงหนึ่งคำสั่งซื้อ'), s('ตรวจสอบสต็อก', '-', 'สต็อกเป็น 0 ไม่ติดลบ')],
        expectedResults: 'ไม่มี Overselling',
      },
    ],
    boundary: [
      {
        name: 'จำนวนสินค้าต่อคำสั่งซื้อที่ขอบเขต',
        testScenario: 'ใส่จำนวน 0, 1 และเกินเพดาน',
        priority: 'medium',
        prerequisite: 'เพดาน 10 ชิ้นต่อคำสั่งซื้อ',
        steps: [s('ใส่จำนวน 0', '0', 'ปุ่มเพิ่มถูกปิด'), s('ใส่จำนวน 10', '10', 'เพิ่มได้'), s('ใส่จำนวน 11', '11', 'แจ้งเตือนเกินเพดาน')],
        expectedResults: 'บังคับใช้จำนวนตามเงื่อนไข',
      },
    ],
  },
]

/** fallback for any requirement: main flow, invalid input, permission, empty / max values */
function genericPack(req: string): Pack {
  const subject =
    req
      .replace(/^REQ-[\w-]+:\s*/i, '')
      .replace(/^ผู้ใช้(สามารถ)?/, '')
      .split(/[,.\n]/)[0]
      .trim()
      .slice(0, 60) || 'ฟังก์ชันตาม Requirement'
  return {
    match: /.*/,
    positive: [
      {
        name: `${subject} สำเร็จ`,
        testScenario: `ทดสอบเส้นทางหลัก: ${subject}`,
        priority: 'high',
        prerequisite: 'ผู้ใช้มีสิทธิ์ใช้งานฟังก์ชันนี้ และมีข้อมูลตัวอย่างพร้อม',
        steps: [
          s('เปิดหน้าที่เกี่ยวข้อง', '-', 'หน้าจอแสดงครบถ้วน'),
          s('ทำรายการตามขั้นตอนปกติด้วยข้อมูลถูกต้อง', 'ข้อมูลตัวอย่างที่ถูกต้อง', 'ระบบประมวลผลสำเร็จ'),
          s('ตรวจสอบผลลัพธ์และข้อมูลที่บันทึก', '-', 'ข้อมูลตรงกับที่กรอก และมีข้อความยืนยัน'),
        ],
        expectedResults: `${subject} ทำงานได้ตาม Requirement`,
      },
    ],
    negative: [
      {
        name: `${subject} ด้วยข้อมูลไม่ถูกต้อง`,
        testScenario: 'กรอกข้อมูลขาด ผิดรูปแบบ หรือไม่ตรงเงื่อนไข',
        priority: 'medium',
        prerequisite: 'เตรียมชุดข้อมูลที่ไม่ถูกต้อง',
        steps: [
          s('ส่งข้อมูลโดยเว้นช่องบังคับ', '-', 'แจ้งเตือนช่องที่ต้องกรอก'),
          s('ส่งข้อมูลผิดรูปแบบ', 'ข้อมูลผิดรูปแบบ', 'ปฏิเสธพร้อมข้อความที่เข้าใจได้'),
        ],
        expectedResults: 'ระบบไม่บันทึกข้อมูลที่ไม่ถูกต้อง',
      },
      {
        name: `${subject} โดยผู้ใช้ที่ไม่มีสิทธิ์`,
        testScenario: 'เข้าใช้งานด้วย Role ที่ไม่ได้รับอนุญาต',
        priority: 'high',
        prerequisite: 'บัญชีทดสอบที่ไม่มีสิทธิ์',
        steps: [s('เข้าสู่ระบบด้วยบัญชีที่ไม่มีสิทธิ์', 'Role ทั่วไป', 'ไม่เห็นเมนูหรือปุ่ม'), s('เรียก URL / API โดยตรง', '-', 'ได้รับ 403')],
        expectedResults: 'ไม่สามารถเข้าถึงฟังก์ชันได้',
      },
    ],
    boundary: [
      {
        name: `${subject} กับค่าขอบเขต`,
        testScenario: 'ทดสอบค่าต่ำสุด สูงสุด และค่าว่าง',
        priority: 'low',
        prerequisite: 'ทราบค่าขอบเขตจากสเปก',
        steps: [
          s('กรอกค่าต่ำสุดที่อนุญาต', 'min', 'ยอมรับ'),
          s('กรอกค่าต่ำกว่าต่ำสุด', 'min - 1', 'ปฏิเสธ'),
          s('กรอกค่าสูงกว่าสูงสุด', 'max + 1', 'ปฏิเสธ'),
        ],
        expectedResults: 'ระบบจัดการค่าขอบเขตถูกต้อง',
      },
    ],
  }
}

/**
 * POST /ai/test-case-drafts
 * Body: { requirement, options } → TestCaseDraft[] (QA reviews before saving)
 */
export function draftTestCases(requirement: string, options: DraftOptions): Promise<TestCaseDraft[]> {
  return respond(
    () => {
      const pack = PACKS.find((p) => p.match.test(`${requirement} ${options.context ?? ''}`)) ?? genericPack(requirement)
      const pick = (kind: 'positive' | 'negative' | 'boundary', list: Pack['positive']) =>
        options[kind] ? list.map((d) => ({ ...d, kind, requirement })) : []
      return [...pick('positive', pack.positive), ...pick('negative', pack.negative), ...pick('boundary', pack.boundary)]
    },
    1400 + Math.random() * 800,
  )
}
