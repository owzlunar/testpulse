import { expect, test } from '@playwright/test'
import { db, login } from './helpers'

// A verdict becomes the case status only when it is the latest result for the current spec
type StoredRun = { id: string; projectId: string; createdAt: string; status: string }
type StoredCase = { id: string; projectId: string; status: string; version: string }
const caseOf = async (page: import('@playwright/test').Page, id: string) =>
  (await db<StoredCase[]>(page, 'testpulse_testcases')).find((c) => c.projectId === 'proj-1' && c.id === id)!

test('a verdict in an older run is kept but does not change the case; the latest run does', async ({ page }) => {
  await login(page)
  await page.goto('/test-runs')
  await expect(page.locator('.fox-page-header')).toBeVisible()
  await expect.poll(async () => (await db<StoredRun[] | null>(page, 'testpulse_test_runs'))?.length ?? 0).toBeGreaterThan(1)
  // reopen the older (closed) run so it can take results
  await page.evaluate(() => {
    const runs = JSON.parse(localStorage.getItem('testpulse_test_runs')!)
    runs.find((r: { id: string }) => r.id === 'run-1').status = 'in_progress'
    localStorage.setItem('testpulse_test_runs', JSON.stringify(runs))
  })

  await page.goto('/test-runs/run-1')
  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-101' }).first().click()
  await expect(page.locator('.v-alert', { hasText: 'จะไม่เปลี่ยนสถานะปัจจุบันของ TC-101' })).toBeVisible()
  await page.locator('[aria-label^="ผลขั้นตอนที่ 1"] button').nth(1).click()
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(page.locator('.v-snackbar__content', { hasText: 'บันทึกผล TC-101' })).toBeVisible()
  expect((await caseOf(page, 'TC-101')).status).toBe('passed')

  await page.goto('/test-runs/run-2')
  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-103' }).first().click()
  const version = (await caseOf(page, 'TC-103')).version
  await page.getByRole('button', { name: 'ผ่านทุกขั้นตอน' }).click()
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect.poll(async () => (await caseOf(page, 'TC-103')).status).toBe('passed')
  expect((await caseOf(page, 'TC-103')).version).toBe(version)
})
