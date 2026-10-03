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

test('AI drafts stay hidden while the server has no model set up', async ({ page }) => {
  const status = page.waitForResponse((r) => r.url().endsWith('/ai/status'))
  await page.reload()
  expect((await (await status).json()).data).toEqual({ enabled: false })
  await openPaymentCases(page)
  await page.getByRole('button', { name: 'สร้าง Test Case' }).first().click()
  await expect(page.locator('.v-overlay--active .v-list-item', { hasText: 'จาก Template' })).toBeVisible()
  await expect(page.locator('.v-overlay--active .v-list-item', { hasText: 'ร่างด้วย AI' })).toHaveCount(0)
})
