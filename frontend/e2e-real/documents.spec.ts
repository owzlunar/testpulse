import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

// Documents on the backend: generated from the server's data, sent for sign-off and signed line by
// line; the organisation's template keeps an uploaded logo by URL

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

/** the payment project (projects made by earlier tests come first in the list) */
async function selectPaymentProject(page: Page) {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('PromptPay & QR')
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'PromptPay & QR Payment Gateway v3' }).click()
  await page.waitForURL('**/test-cases')
}

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
})

test('a summary report is generated on the server, sent for sign-off and signed; it is there after a reload', async ({ page }) => {
  await selectPaymentProject(page)
  await page.locator('.fox-nav').getByText('ศูนย์เอกสาร', { exact: true }).click()
  await page.locator('.doc-quick', { hasText: 'Test Summary Report' }).click()
  const wizard = page.locator('.v-dialog')
  await wizard.getByRole('button', { name: 'ถัดไป' }).click()
  await wizard.getByRole('button', { name: 'สร้างเอกสาร' }).click()
  await page.waitForURL(/\/documents\/doc-[\w-]+$/)
  await expect(page.locator('.doc-sheet')).toContainText('PromptPay & QR Payment Gateway v3')
  await expect(page.locator('.doc-facts')).toContainText(ACCOUNTS.qaLead.name)

  await page.getByRole('button', { name: 'ส่งขอลงนาม' }).click()
  await expect(page.locator('.doc-side .v-chip').first()).toHaveText('รอลงนาม')
  // the QA Lead is the first signatory (the template's default)
  await page.locator('.doc-side').getByRole('button', { name: 'ลงนาม', exact: true }).first().click()
  await page.locator('.v-dialog').getByRole('button', { name: 'ลงนาม', exact: true }).click()
  await expect(page.locator('.doc-side')).toContainText('1/3')

  await page.reload()
  await expect(page.locator('.doc-side .v-chip').first()).toHaveText('รอลงนาม')
  await expect(page.locator('.doc-side')).toContainText('1/3')
})

test('the document template keeps an uploaded logo', async ({ page }) => {
  await page.goto('/settings')
  const logo = page.locator('.tpl-logo')
  await page.locator('.v-col:has(.tpl-logo) input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await expect(logo.locator('img')).toHaveAttribute('src', /\/api\/v1\/files\/[\w-]+\/content$/)
  await page.getByRole('button', { name: 'บันทึกแม่แบบ' }).click()
  await expect(page.getByText('บันทึกแม่แบบเอกสารแล้ว')).toBeVisible()

  await page.reload()
  await expect(logo.locator('img')).toHaveAttribute('src', /\/api\/v1\/files\/[\w-]+\/content$/)
  expect(await logo.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('a Traceability Matrix of the TOR only lists the TOR clauses, not the additional requirements', async ({ page }) => {
  await selectPaymentProject(page)
  await page.locator('.fox-nav').getByText('ศูนย์เอกสาร', { exact: true }).click()
  await page.locator('.doc-quick', { hasText: 'Traceability Matrix' }).click()
  const wizard = page.locator('.v-dialog')
  // a title without the project's name: later tests find the project by name in the universal search
  await wizard.locator('#doc-title').fill('RTM ตาม TOR e2e-real')
  await wizard.getByLabel('เฉพาะ Requirement ตาม TOR').check()
  await wizard.getByRole('button', { name: 'ถัดไป' }).click()
  await wizard.getByRole('button', { name: 'สร้างเอกสาร' }).click()
  await page.waitForURL(/\/documents\/doc-[\w-]+$/)
  const sheet = page.locator('.doc-sheet')
  await expect(sheet.locator('th', { hasText: 'ข้อใน TOR' })).toBeVisible()
  await expect(sheet.locator('td', { hasText: '4.2.1' })).toBeVisible()
  await expect(sheet).not.toContainText('REQ-PAY-03')
})
