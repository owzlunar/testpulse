import { expect, test } from '@playwright/test'
import { ACCOUNTS, signIn, toast } from './helpers'

// Roles, projects (with an uploaded logo) and settings: saved by the backend, still there after a reload

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test('an Admin creates a role; it is still there after a reload', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email)
  await page.goto('/admin/permissions')
  await page.getByRole('button', { name: 'สร้าง Role' }).click()
  await page.locator('#role-name').fill('Release Manager')
  await page.locator('.v-dialog').getByRole('button', { name: 'สร้าง Role' }).click()
  await expect(toast(page)).toBeVisible()
  await page.reload()
  await expect(page.getByText('Release Manager').first()).toBeVisible()
})

test('an Admin creates a project with an uploaded logo', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email)
  await page.getByRole('button', { name: 'สร้างโปรเจกต์' }).first().click()
  await page.locator('.v-dialog input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await page.locator('#pj-key').fill('CRM')
  await page.locator('#pj-name').fill('CRM Revamp')
  await expect(page.locator('.v-dialog img[src*="/api/v1/files/"]')).toBeVisible()
  await page.locator('.v-dialog').getByRole('button', { name: 'สร้างโปรเจกต์' }).click()
  await expect(toast(page)).toContainText('สร้างโปรเจกต์แล้ว')

  await page.reload()
  const card = page.locator('.project-card', { hasText: 'CRM Revamp' })
  await expect(card).toBeVisible()
  const logo = card.locator('img').first()
  await expect(logo).toHaveAttribute('src', /\/api\/v1\/files\/file-.+\/content$/)
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('settings are saved per user on the server', async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  await page.goto('/settings')
  const sw = page.getByLabel('เมื่อสถานะเปลี่ยน (Passed, Failed, Blocked)')
  await expect(sw).toBeChecked()
  await sw.click()
  await expect(toast(page)).toContainText('บันทึกการตั้งค่าแล้ว')
  await page.reload()
  await expect(page.getByLabel('เมื่อสถานะเปลี่ยน (Passed, Failed, Blocked)')).not.toBeChecked()
})
