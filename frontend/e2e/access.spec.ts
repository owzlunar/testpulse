import { expect, test } from '@playwright/test'
import { login, toast } from './helpers'

// Who sees what: team-based project access, role permissions, users without a role
const projectNames = (page: import('@playwright/test').Page) =>
  page.locator('.project-card').evaluateAll((cards) => cards.map((c) => (c.textContent ?? '').trim().slice(0, 12)))
const navItems = (page: import('@playwright/test').Page) => page.locator('.fox-nav .v-list-item-title').allInnerTexts()

test('a QA Tester in team E-Commerce sees only that team project and the one without a team', async ({ page }) => {
  await login(page, 'พิชญา')
  await expect(page.locator('.project-card')).toHaveCount(2)
  expect((await projectNames(page)).join(' ')).not.toContain('PromptPay')
  await page.locator('.v-app-bar input').first().fill('PromptPay')
  await expect(page.locator('.v-overlay--active .v-list-item')).toHaveCount(0)
  expect(await navItems(page)).not.toContain('ผู้ใช้งาน')
})

test('Admin sees every project and the admin menus', async ({ page }) => {
  await login(page)
  await expect(page.locator('.project-card')).toHaveCount(3)
  expect(await navItems(page)).toEqual(expect.arrayContaining(['ผู้ใช้งาน', 'Role และสิทธิ์', 'ทีม']))
})

test('a typed URL the role may not open goes back to the dashboard with a message', async ({ page }) => {
  await login(page, 'พิชญา')
  await page.goto('/admin/users')
  await page.waitForURL('**/dashboard')
  await expect(toast(page).filter({ hasText: 'คุณไม่มีสิทธิ์เปิดหน้า ผู้ใช้งาน' })).toBeVisible()
})

test('a new user without a role sees only the dashboard and settings', async ({ page }) => {
  await page.goto('/register')
  await page.fill('#reg-name', 'ผู้ใช้ ใหม่')
  await page.fill('#reg-email', 'new.user@testpulse.dev')
  await page.fill('#reg-pw', 'Passw0rd!')
  await page.getByRole('button', { name: 'สมัครสมาชิก' }).click()
  await page.waitForURL('**/dashboard')
  await expect(page.getByText('บัญชีของคุณยังไม่มี Role')).toBeVisible()
  expect(await navItems(page)).toEqual(['ภาพรวมโปรเจกต์', 'ตั้งค่า', 'ออกจากระบบ'])
  await expect(page.getByLabel('การแจ้งเตือน')).toHaveCount(0)
  await page.goto('/test-cases')
  await page.waitForURL('**/dashboard')
})

test('a Developer may move a defect along but not close it, and creates no documents', async ({ page }) => {
  await login(page, 'กิตติศักดิ์')
  await page.goto('/defects')
  await page.locator('tbody tr').first().click()
  await page.locator('.v-chip:has(.v-chip__append)').first().click()
  const item = (label: string) => page.locator('.v-overlay--active .v-list-item', { hasText: label })
  await expect(item('Fixed')).not.toHaveClass(/v-list-item--disabled/)
  await expect(item('Closed')).toHaveClass(/v-list-item--disabled/)
  await expect(item('Rejected')).toHaveClass(/v-list-item--disabled/)
  await page.keyboard.press('Escape')
  await page.goto('/documents')
  await expect(page.getByRole('heading', { name: 'ศูนย์เอกสาร' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'สร้างเอกสาร' })).toHaveCount(0)
})
