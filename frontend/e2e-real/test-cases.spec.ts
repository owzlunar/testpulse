import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

// Test cases, requirements and templates on the backend: numbering, uploaded evidence, archive with
// the server's impact, and the universal search (cases and requirements of every project)

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const caseIds = (page: Page) => page.locator('.tc-slot .v-chip.fox-num').allInnerTexts()

/** the payment project's cases (other projects made by earlier tests come first in the list) */
async function openPaymentCases(page: Page) {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('PromptPay & QR')
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'PromptPay & QR Payment Gateway v3' }).click()
  await page.waitForURL('**/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
})

test('a new case is numbered by the server, keeps its uploaded screenshot, and is there after a reload', async ({ page }) => {
  await openPaymentCases(page)
  await page.getByRole('button', { name: 'สร้าง Test Case' }).first().click()
  await page.locator('.v-overlay--active .v-list-item').first().click()
  await page.fill('#tc-name', 'เคสใหม่ e2e-real')
  await page.fill('#tc-req', 'ทดสอบ')
  await page.fill('#tc-scenario', 'ทดสอบ')
  await page.getByRole('tab', { name: 'ผลลัพธ์' }).click()
  await page.fill('#tc-expected', 'ok')
  await page.locator('.v-bottom-sheet input[type="file"]').first().setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.locator('.v-bottom-sheet img[src*="/api/v1/files/"]').first()).toBeVisible()
  await page.locator('.v-bottom-sheet').getByRole('button', { name: 'สร้าง Test Case' }).click()
  await expect.poll(() => caseIds(page)).toContain('TC-105')

  await page.reload()
  await expect.poll(() => caseIds(page)).toContain('TC-105')
  await page.getByLabel('เปิด TC-105', { exact: true }).click()
  await page.getByRole('tab', { name: 'ผลลัพธ์' }).click()
  const shot = page.locator('.v-bottom-sheet img[src*="/api/v1/files/"]').first()
  // evidence gets a long random id (its content is served without a token)
  await expect(shot).toHaveAttribute('src', /\/api\/v1\/files\/file-[\w-]{22}\/content$/)
  expect(await shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('archiving shows what the server says it touches; the case comes back from the archive', async ({ page }) => {
  await openPaymentCases(page)
  await page.getByLabel('ตัวเลือก TC-104').click()
  await page.getByText('เก็บเข้าคลัง', { exact: true }).click()
  await expect(page.locator('.remove-impact')).toContainText('REQ-PAY-04 จะไม่เหลือ Test Case ครอบคลุม')
  await page.locator('.v-dialog').getByRole('button', { name: 'เก็บเข้าคลัง' }).click()
  await expect.poll(() => caseIds(page)).not.toContain('TC-104')

  await page.getByRole('button', { name: 'คลังเก็บ' }).click()
  await page.locator('.v-btn', { hasText: 'กู้คืน' }).click()
  await page.getByRole('button', { name: 'ใช้งานอยู่' }).click()
  await page.reload()
  await expect.poll(() => caseIds(page)).toContain('TC-104')
})

test('the universal search finds a requirement of any project and opens it', async ({ page }) => {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('Webhook Retry')
  const menu = page.locator('.v-overlay--active')
  await expect(menu.locator('.v-list-subheader', { hasText: 'Requirements' })).toBeVisible()
  await menu.locator('.v-list-item', { hasText: 'REQ-PAY-04' }).click()
  await page.waitForURL(/\/requirements\?search=REQ-PAY-04$/)
  await expect(page.getByText('Webhook Retry แบบ Exponential Backoff และ DLQ').first()).toBeVisible()
})

test('a TOR requirement keeps its clause; the list filters by origin and finds the clause', async ({ page }) => {
  await openPaymentCases(page)
  await page.locator('.fox-nav').getByText('Requirements', { exact: true }).click()
  await page.getByRole('button', { name: 'เพิ่ม Requirement' }).click()
  const dialog = page.locator('.v-dialog')
  await dialog.locator('#rq-title').fill('ส่งออกรายงานภาษี e2e-real')
  // TOR is the default origin: the clause is required
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(dialog.locator('#rq-tor')).toBeVisible()
  await dialog.locator('#rq-tor').fill('4.9.1')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(dialog).toBeHidden()

  await page.reload()
  const card = page.locator('.v-window-item--active .v-card', { hasText: 'ส่งออกรายงานภาษี e2e-real' })
  await expect(card.locator('.v-chip', { hasText: 'TOR 4.9.1' })).toBeVisible()
  await page.locator('.v-field', { has: page.getByLabel('ข้อกำหนดจาก') }).click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'เพิ่มเติม' }).click()
  await expect(card).toHaveCount(0)
  await expect(page.getByText('ป้องกัน Double Spending และ Replay Attack')).toBeVisible()

  await page.getByLabel('ค้นหาทั้งระบบ').fill('4.9.1')
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'ส่งออกรายงานภาษี e2e-real' }).click()
  await page.waitForURL(/\/requirements\?search=/)
})

test('requirements pasted from Excel: TOR rows by their clause, new codes from the server', async ({ page }) => {
  await openPaymentCases(page)
  await page.locator('.fox-nav').getByText('Requirements', { exact: true }).click()
  await page.getByRole('button', { name: 'นำเข้า' }).click()
  const dialog = page.locator('.v-dialog')
  const table = [
    ['ข้อใน TOR', 'ชื่อ', 'Acceptance Criteria', 'Priority'],
    ['8.1', 'ส่งออกรายงานภาษีนำเข้า', 'ส่งออกเป็น PDF', 'High'],
    ['', 'แจ้งเตือนทาง LINE นำเข้า', '', 'Low'],
  ]
  await dialog.locator('#imp-paste').fill(table.map((r) => r.join('\t')).join('\n'))
  await dialog.getByRole('button', { name: 'ถัดไป' }).click()
  await dialog.getByRole('button', { name: 'ตรวจสอบ' }).click()
  await expect(dialog.locator('.v-chip', { hasText: 'เพิ่มใหม่ 2' })).toBeVisible()
  await dialog.getByRole('button', { name: 'นำเข้า 2 รายการ' }).click()
  await expect(dialog).toBeHidden()

  await page.reload()
  const tor = page.locator('.v-window-item--active .v-card', { hasText: 'ส่งออกรายงานภาษีนำเข้า' })
  await expect(tor.locator('.v-chip', { hasText: 'TOR 8.1' })).toBeVisible()
  await expect(tor.locator('.v-chip', { hasText: /^REQ-PAY-\d+$/ })).toBeVisible()
  const extra = page.locator('.v-window-item--active .v-card', { hasText: 'แจ้งเตือนทาง LINE นำเข้า' })
  await expect(extra.locator('.v-chip', { hasText: 'เพิ่มเติม' })).toBeVisible()
})

test('AI drafts stay hidden while the server has no model set up', async ({ page }) => {
  const status = page.waitForResponse((r) => r.url().endsWith('/ai/status'))
  await page.reload()
  expect((await (await status).json()).data).toEqual({ enabled: false })
  await openPaymentCases(page)
  await page.getByRole('button', { name: 'สร้าง Test Case' }).first().click()
  await expect(page.locator('.v-overlay--active .v-list-item', { hasText: 'จาก Template' })).toBeVisible()
  await expect(page.locator('.v-overlay--active .v-list-item', { hasText: 'ร่างด้วย AI' })).toHaveCount(0)
})
