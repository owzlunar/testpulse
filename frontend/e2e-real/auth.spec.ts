import { expect, test } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

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

test('a user signed in for real also works on the modules still on the mock (test cases)', async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  // PromptPay: the project with the mock's demo cases
  await page.evaluate(() => localStorage.setItem('testpulse_selected_project_id', 'proj-1'))
  await page.goto('/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()
  await expect(page.locator('.tc-slot', { hasText: 'TC-101' }).first()).toBeVisible()
})
