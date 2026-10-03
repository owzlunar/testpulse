import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

// Reports on the backend: the server sums up the project (cases, runs, open defects); exporting the
// cases as Markdown is recorded by the server

/** the payment project (projects made by earlier tests come first in the list) */
async function selectPaymentProject(page: Page) {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('PromptPay & QR')
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'PromptPay & QR Payment Gateway v3' }).click()
  await page.waitForURL('**/test-cases')
}

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  await selectPaymentProject(page)
})

test("the report shows the server's summary of the project: runs and open defects", async ({ page }) => {
  const report = page.waitForResponse((r) => /\/projects\/[\w-]+\/report$/.test(r.url()) && r.ok())
  await page.locator('.fox-nav').getByText('รายงาน', { exact: true }).click()
  await report
  await expect(page.locator('.report-runs')).toContainText(/รอบที่ \d+/)
  await expect(page.locator('.report-defects')).toContainText(/\d+ จาก \d+ รายการ/)
})

test('exporting the cases as Markdown is in the audit log', async ({ page }) => {
  await page.locator('.fox-nav').getByText('รายงาน', { exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'ส่งออก .md' }).click()
  const file = (await download).suggestedFilename()
  await page.goto('/audit-trail')
  await expect(page.getByText(`(${file})`).first()).toBeVisible()
})
