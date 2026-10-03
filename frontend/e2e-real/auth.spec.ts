import { expect, test } from '@playwright/test'
import { ACCOUNTS, signIn, toast } from './helpers'

// Sign-in, the session (access token in memory, refresh cookie) and project access, against the backend

test('a wrong password is refused in the form, the right one signs in', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#login-email').fill(ACCOUNTS.admin.email)
  await page.locator('#login-pw').fill('not-the-password')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click()
  await expect(page.locator('.v-alert', { hasText: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, ACCOUNTS.admin.email)
  // an Admin opens every project (other tests may add more)
  for (const name of ['PromptPay', 'SuperApp', 'Enterprise SSO']) await expect(page.locator('.project-card', { hasText: name })).toBeVisible()
})

test('the session survives a reload (refresh cookie) and ends with sign-out', async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  await page.reload()
  await expect(page.locator('.fox-nav')).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.locator('.fox-nav').getByText('ออกจากระบบ').click()
  await page.waitForURL('**/login')
  // the refresh cookie is revoked: the app asks to sign in again
  await page.goto('/dashboard')
  await page.waitForURL('**/login')
})

test('a fresh browser without a session lands on the login page', async ({ page }) => {
  await page.goto('/test-cases')
  await page.waitForURL('**/login')
})

test('each user sees only the projects of their teams (and those without a team)', async ({ page }) => {
  await signIn(page, ACCOUNTS.tester.email) // team E-Commerce
  await expect(page.locator('.project-card', { hasText: 'SuperApp' })).toBeVisible() // its team's project
  await expect(page.locator('.project-card', { hasText: 'Enterprise SSO' })).toBeVisible() // no team: open to every role
  await expect(page.locator('.project-card', { hasText: 'PromptPay' })).toHaveCount(0) // team Payment only
})

test('modules the backend lacks are off: no menu, and their pages lead back to the dashboard', async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  const nav = page.locator('.fox-nav')
  for (const item of ['Test Cases', 'Requirements', 'ปฏิทินงานทดสอบ', 'รอบการทดสอบ', 'Defects', 'รายงาน'])
    await expect(nav.getByText(item, { exact: true })).toHaveCount(1)
  for (const item of ['ศูนย์เอกสาร']) await expect(nav.getByText(item, { exact: true })).toHaveCount(0)
  await page.goto('/documents')
  await page.waitForURL('**/dashboard')
})

test('the access token is renewed before it expires (silent refresh): no request meets a 401', async ({ page }) => {
  test.setTimeout(150_000)
  const unauthorized: string[] = []
  page.on('response', (r) => r.status() === 401 && unauthorized.push(r.url()))
  await signIn(page, ACCOUNTS.admin.email)
  // the e2e backend issues 60 s access tokens: the app renews them 15 s before they run out
  const renewed = await page.waitForResponse((r) => r.url().endsWith('/auth/refresh'), { timeout: 60_000 })
  expect(renewed.status()).toBe(200)
  // past the first token's life: a change made without reloading goes through with the renewed one
  await page.waitForTimeout(20_000)
  await page.locator('.fox-nav').getByText('ตั้งค่า', { exact: true }).click()
  await page.getByLabel('เมื่อสถานะเปลี่ยน (Passed, Failed, Blocked)').click()
  await expect(toast(page)).toContainText('บันทึกการตั้งค่าแล้ว')
  expect(unauthorized).toEqual([])
})
