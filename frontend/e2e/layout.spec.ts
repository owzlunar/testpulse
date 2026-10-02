import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => login(page))

test('the brand stays at the top of the drawer while the menu scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 })
  await page.locator('.fox-nav .v-navigation-drawer__content').evaluate((e) => (e.scrollTop = 400))
  await expect(page.locator('.fox-nav__brand')).toBeInViewport()
})

test('the page header sticks compact under the app bar, and can be turned off in Settings', async ({ page }) => {
  await page.goto('/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()
  await page.mouse.move(800, 500)
  await page.mouse.wheel(0, 900)
  await expect(page.locator('.fox-page-header--stuck')).toBeVisible()
  await expect(page.locator('.fox-page-header--stuck h1')).toHaveClass(/text-h5/)

  await page.goto('/settings')
  await page.getByLabel('ตรึงหัวหน้าเพจไว้ด้านบนเมื่อเลื่อนหน้าจอ').click()
  await expect(page.locator('.v-snackbar__content', { hasText: 'บันทึกการตั้งค่าแล้ว' })).toBeVisible()
  await page.goto('/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()
  await expect(page.locator('.fox-page-header--sticky')).toHaveCount(0)
})

test('the test case form is a bottom sheet over the content area, the same size on every tab', async ({ page }) => {
  await page.goto('/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()
  await page.getByLabel('เปิด TC-101', { exact: true }).click()
  const sheet = page.locator('.v-bottom-sheet .v-overlay__content > .v-card')
  await expect(sheet).toBeVisible()
  const sizes = new Set<string>()
  for (const tab of ['ข้อกำหนด', 'ขั้นตอน', 'ผลลัพธ์', 'ประวัติ']) {
    await page.getByRole('tab', { name: tab }).click()
    const box = (await sheet.boundingBox())!
    sizes.add(`${Math.round(box.width)}x${Math.round(box.height)}`)
    expect(Math.round(box.x)).toBe(264) // beside the drawer
  }
  expect(sizes.size).toBe(1)
})

test('a detail page opened directly keeps its module highlighted in the drawer', async ({ page }) => {
  await page.goto('/test-runs/run-2')
  await expect(page.locator('.exec-list__items')).toBeVisible()
  await expect(page.locator('.fox-nav .v-list-item--active')).toHaveText(/รอบการทดสอบ/)
  await expect(page.locator('.fox-nav .v-list-item--active')).toHaveCount(1)
})

