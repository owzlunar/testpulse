import { expect, test } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

// The universal search on the backend: defects, runs and documents too; Enter opens every match on
// the results page

test.beforeEach(async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
})

const menu = (page: import('@playwright/test').Page) => page.locator('.v-overlay--active')

test('a defect is found by its number and opens', async ({ page }) => {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('BUG-001')
  await expect(menu(page).locator('.v-list-subheader', { hasText: 'Defects' })).toBeVisible()
  await menu(page).locator('.search-hit', { hasText: 'BUG-001' }).click()
  await page.waitForURL(/\/defects\?id=BUG-001$/)
})

test('a test run is found by its name and opens', async ({ page }) => {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('Sprint 42 · Regression')
  // the run itself ("รอบที่ 2 Sprint 42 · Regression"), not a document whose title names it
  await menu(page)
    .locator('.search-hit', { hasText: /รอบที่ 2\s+Sprint 42 · Regression/ })
    .click()
  await page.waitForURL('**/test-runs/run-2')
})

test('Enter shows every match on the results page, one tab per group', async ({ page }) => {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('TC-10')
  await expect(menu(page).locator('.search-hit').first()).toBeVisible()
  await page.getByLabel('ค้นหาทั้งระบบ').press('Enter')
  await page.waitForURL(/\/search\?q=TC-10$/)
  await expect(page.getByRole('tab', { name: /Test Cases/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.search-hit', { hasText: 'TC-101' }).first()).toBeVisible()
  await page.getByRole('tab', { name: /Defects/ }).click()
  await expect(page).toHaveURL(/type=defects/)
})
