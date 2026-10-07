import { expect, test } from '@playwright/test'
import { login, open, toast } from './helpers'

// The backup page (Admin only) on the mock agent: status, run a job and follow it, a restore drill,
// a job's log, schedules and alerts.

test('the Admin backs up now and sees the job finish with a new snapshot', async ({ page }) => {
  await login(page)
  await page.locator('.fox-nav').getByText('สำรองข้อมูล').click()
  await page.waitForURL('**/admin/backup')
  await expect(page.getByText('MinIO off-site (mirror)')).toBeVisible()
  const snapshots = page.locator('.v-card', { hasText: 'Snapshot' }).last().locator('tbody tr')
  await expect(snapshots).toHaveCount(3)

  await page.getByRole('button', { name: 'สำรองเดี๋ยวนี้' }).click()
  await expect(page.getByText('กำลังสำรองข้อมูล')).toBeVisible()
  await expect(page.getByRole('button', { name: 'สำรองเดี๋ยวนี้' })).toBeDisabled()
  // the page polls the agent until the job is done
  await expect(toast(page).filter({ hasText: 'สำรองข้อมูล: สำเร็จ' })).toBeVisible({ timeout: 15_000 })
  await expect(snapshots).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'สำรองเดี๋ยวนี้' })).toBeEnabled()

  await page
    .getByRole('button', { name: /^ดู log ของสำรองข้อมูล/ })
    .first()
    .click()
  await expect(page.locator('.fox-log')).toContainText('[mock] สำรองแล้ว')
  await page.getByRole('button', { name: 'ปิด', exact: true }).last().click()
})

test('a restore drill of a chosen snapshot', async ({ page }) => {
  await login(page)
  await open(page, '/admin/backup')
  const row = page.locator('.v-card', { hasText: 'Snapshot' }).last().locator('tbody tr').nth(1)
  const name = (await row.locator('td').first().innerText()).trim()
  await row.getByRole('button', { name: 'ซ้อมกู้' }).click()
  const dialog = page.locator('.v-dialog', { hasText: 'เริ่มซ้อมกู้' })
  await expect(dialog.getByText(name)).toBeVisible()
  await dialog.getByRole('button', { name: 'เริ่มซ้อมกู้' }).click()
  await expect(toast(page).filter({ hasText: 'ซ้อมกู้: สำเร็จ' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('tbody tr', { hasText: `ซ้อมกู้ ${name}` })).toBeVisible()
})

test('schedules and alerts: the backup time, team email, a Teams webhook never shown back', async ({ page }) => {
  await login(page)
  await open(page, '/admin/backup')
  await page.getByRole('button', { name: 'ตั้งค่า' }).click()
  const dialog = page.locator('.v-dialog', { hasText: 'ตั้งค่าการสำรองข้อมูล' })
  await dialog.locator('#backup-time').fill('01:30')
  await dialog.locator('#alert-teams').click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'Payment' }).first().click()
  await page.keyboard.press('Escape')
  await dialog.getByLabel('Microsoft Teams (channel ที่กำหนด)').check()
  await dialog.locator('#alert-webhook').fill('https://prod.example.com/workflows/abc/invoke?sig=SECRET1')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(toast(page).filter({ hasText: 'บันทึกตั้งค่าการสำรองข้อมูลแล้ว' })).toBeVisible()
  await expect(page.getByText('ทุกวัน 01:30 น.')).toBeVisible()

  await page.getByRole('button', { name: 'ตั้งค่า' }).click()
  await expect(dialog.locator('#alert-webhook')).toHaveValue('')
  await expect(dialog.locator('#alert-webhook')).toHaveAttribute('placeholder', /ตั้งไว้แล้ว \(…ECRET1\)/)
  await dialog.getByRole('button', { name: 'ส่งข้อความทดสอบ' }).click()
  await expect(toast(page).filter({ hasText: 'ส่งข้อความทดสอบแล้ว' })).toBeVisible()
})

test('only the Admin has the backup page', async ({ page }) => {
  await login(page, 'พิชญา')
  expect(await page.locator('.fox-nav .v-list-item-title').allInnerTexts()).not.toContain('สำรองข้อมูล')
  await page.goto('/admin/backup')
  await page.waitForURL('**/dashboard')
})

test('replacing a secret URL: "ลบ" then a new URL saves the new one in one go', async ({ page }) => {
  await login(page)
  await open(page, '/admin/backup')
  const dialog = page.locator('.v-dialog', { hasText: 'ตั้งค่าการสำรองข้อมูล' })
  const webhook = dialog.locator('#alert-webhook')

  await page.getByRole('button', { name: 'ตั้งค่า' }).click()
  await dialog.getByLabel('Microsoft Teams (channel ที่กำหนด)').check()
  await webhook.fill('https://old.example.com/hook?sig=OLD111')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(toast(page).filter({ hasText: 'บันทึกตั้งค่าการสำรองข้อมูลแล้ว' })).toBeVisible()

  await page.getByRole('button', { name: 'ตั้งค่า' }).click()
  await expect(webhook).toHaveAttribute('placeholder', /…OLD111/)
  await dialog.getByRole('button', { name: 'ลบ' }).first().click()
  await webhook.fill('https://new.example.com/hook?sig=NEW222')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(toast(page).filter({ hasText: 'บันทึกตั้งค่าการสำรองข้อมูลแล้ว' })).toBeVisible()

  await page.getByRole('button', { name: 'ตั้งค่า' }).click()
  await expect(webhook).toHaveAttribute('placeholder', /…NEW222/)
})
