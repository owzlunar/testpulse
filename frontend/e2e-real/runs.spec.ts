import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, signIn, toast } from './helpers'

// Test runs on the backend: the server snapshots the cases; a verdict in the latest run becomes the
// case status (seeded: run-2 "Sprint 42 · Regression" in progress, TC-103 failed)

/** the payment project (projects made by earlier tests come first in the list) */
async function selectPaymentProject(page: Page) {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('PromptPay & QR')
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'PromptPay & QR Payment Gateway v3' }).click()
  await page.waitForURL('**/test-cases')
}

const statusOf = (page: Page, id: string) =>
  page
    .locator('.tc-slot', { has: page.getByLabel(`เปิด ${id}`, { exact: true }) })
    .locator('.v-chip')
    .nth(1)

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  await selectPaymentProject(page)
})

test('a QA Lead plans a run of chosen cases; it is there after a reload', async ({ page }) => {
  await page.locator('.fox-nav').getByText('รอบการทดสอบ').click()
  await page.getByRole('button', { name: 'สร้างรอบการทดสอบ' }).first().click()
  await page.locator('#run-name').fill('Hotfix Smoke')
  await page.locator('#run-env').fill('UAT')
  await page.locator('.v-dialog').getByRole('button', { name: 'ล้าง' }).click()
  await page.locator('.run-case', { hasText: 'TC-103' }).click()
  await page
    .locator('.v-dialog')
    .getByRole('button', { name: /สร้างรอบ \(1 เคส\)/ })
    .click()
  await expect(page.getByText('Hotfix Smoke').first()).toBeVisible()
  await page.reload()
  await expect(page.getByText('Hotfix Smoke').first()).toBeVisible()
})

test('a pass recorded in the latest run becomes the case status', async ({ page }) => {
  await page.goto('/test-runs/run-2')
  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-103' }).first().click()
  await page.getByRole('button', { name: 'ผ่านทุกขั้นตอน' }).click()
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(toast(page).filter({ hasText: 'บันทึกผล TC-103' })).toBeVisible()

  await page.goto('/test-cases')
  await expect(statusOf(page, 'TC-103')).toHaveText('Passed')
})
