import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, signIn, toast } from './helpers'

// Defects on the backend: reported from a failed step (numbered by the server, linked to the result),
// moved along by a developer who may not close them, comments by the signed-in user

/** the payment project (projects made by earlier tests come first in the list) */
async function selectPaymentProject(page: Page) {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('PromptPay & QR')
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'PromptPay & QR Payment Gateway v3' }).click()
  await page.waitForURL('**/test-cases')
}

test('a failed step is reported as a defect the server numbers; it stays linked to the result', async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  await selectPaymentProject(page)
  await page.goto('/test-runs/run-2')
  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-104' }).first().click()
  await page.locator('[aria-label="ผลขั้นตอนที่ 1"] button').nth(1).click()
  await page.getByRole('button', { name: 'รายงาน Defect จากขั้นตอนนี้' }).click()
  await page.locator('.v-dialog').getByLabel('ผลที่เกิดขึ้นจริง *').fill('ไม่ยิงซ้ำ')
  await page.locator('.v-dialog').getByRole('button', { name: 'รายงาน Defect' }).click()
  const linked = page.locator('.v-chip', { hasText: /BUG-\d{3}/ }).first()
  await expect(linked).toBeVisible()
  const id = (await linked.innerText()).match(/BUG-\d{3}/)![0]
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(toast(page).filter({ hasText: 'บันทึกผล TC-104' })).toBeVisible()

  await page.reload()
  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-104' }).first().click()
  await expect(page.locator('.v-chip', { hasText: id })).toBeVisible()
  await page.goto('/defects')
  await expect(page.locator('tbody tr', { hasText: id })).toBeVisible()
})

test('a developer moves a defect along but cannot close it; a comment carries their name', async ({ page }) => {
  await signIn(page, ACCOUNTS.developer.email)
  await selectPaymentProject(page)
  await page.goto('/defects')
  await page.locator('tbody tr', { hasText: 'BUG-001' }).click()
  await page.locator('.v-chip:has(.v-chip__append)').first().click()
  const item = (label: string) => page.locator('.v-overlay--active .v-list-item', { hasText: label })
  await expect(item('Fixed')).not.toHaveClass(/v-list-item--disabled/)
  await expect(item('Closed')).toHaveClass(/v-list-item--disabled/)
  await page.keyboard.press('Escape')

  await page.getByLabel('ความคิดเห็น').fill('แก้แล้วใน rc3')
  await page.getByRole('button', { name: 'ส่ง' }).click()
  await page.reload()
  await page.locator('tbody tr', { hasText: 'BUG-001' }).click()
  await expect(page.getByText('แก้แล้วใน rc3')).toBeVisible()
  await expect(page.getByText(ACCOUNTS.developer.name).first()).toBeVisible()
})
