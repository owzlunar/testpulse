import { expect, test } from '@playwright/test'
import { ACCOUNTS, inviteLinkFor, signIn, toast } from './helpers'

// Invites by email (Mailpit), roles and passwords, through the app against the backend

test('an Admin invites a user, who sets a password from the mailed link and signs in', async ({ page, browser }) => {
  const email = `invited.${Date.now()}@testpulse.dev`
  await signIn(page, ACCOUNTS.admin.email)
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'เพิ่มผู้ใช้งาน' }).click()
  await page.locator('#usr-name').fill('วิชัย ทดสอบเชิญ')
  await page.locator('#usr-email').fill(email)
  await page.locator('.v-dialog').getByRole('button', { name: 'บันทึก' }).click()
  await expect(toast(page)).toContainText(`ส่งคำเชิญไปที่ ${email}`)
  const row = page.locator('tr', { hasText: email })
  await expect(row.getByText('รอตอบรับคำเชิญ')).toBeVisible()

  // the invited person, in another browser
  const link = await inviteLinkFor(email)
  const invited = await (await browser.newContext()).newPage()
  await invited.goto(link.replace(/^https?:\/\/[^/]+/, 'http://localhost:5176'))
  await expect(invited.getByText(`สวัสดีคุณ วิชัย ทดสอบเชิญ (${email})`)).toBeVisible()
  await invited.locator('#invite-pw').fill('my-own-password')
  await invited.locator('#invite-confirm').fill('my-own-password')
  await invited.getByRole('button', { name: 'ตั้งรหัสผ่านและเข้าสู่ระบบ' }).click()
  await invited.waitForURL('**/dashboard')
  // no role yet: no project, no module pages
  await expect(invited.locator('.fox-nav').getByText('Test Cases')).toHaveCount(0)

  // the link works once
  await invited.goto(link.replace(/^https?:\/\/[^/]+/, 'http://localhost:5176'))
  await expect(invited.getByText('ใช้ลิงก์นี้ไม่ได้')).toBeVisible()

  // a role from the Admin applies on the invited user's next request
  await page.reload()
  await page.locator('tr', { hasText: email }).getByRole('combobox').click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'QA Tester' }).click()
  await expect(toast(page)).toContainText('เป็น QA Tester')
  await invited.goto('http://localhost:5176/dashboard')
  await expect(invited.locator('.fox-nav').getByText('Test Cases')).toBeVisible()
})

test('a user changes their password: the old one stops working', async ({ page }) => {
  await signIn(page, ACCOUNTS.tester.email)
  await page.goto('/settings')
  await page.locator('#pw-current').fill('password123')
  await page.locator('#pw-new').fill('a-brand-new-pass')
  await page.locator('#pw-confirm').fill('a-brand-new-pass')
  await page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }).click()
  await expect(toast(page)).toContainText('เปลี่ยนรหัสผ่านแล้ว')

  await page.locator('.fox-nav').getByText('ออกจากระบบ').click()
  await page.waitForURL('**/login')
  await page.locator('#login-email').fill(ACCOUNTS.tester.email)
  await page.locator('#login-pw').fill('password123')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click()
  await expect(page.locator('.v-alert', { hasText: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })).toBeVisible()
  await signIn(page, ACCOUNTS.tester.email, 'a-brand-new-pass')
})
