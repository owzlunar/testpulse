import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Leaving a form with unsaved changes asks first (useUnsavedChanges)
test.beforeEach(async ({ page }) => login(page))

const prompt = (page: import('@playwright/test').Page) => page.locator('.v-dialog', { hasText: 'ออกโดยไม่บันทึก?' })

test('back on an edited test case form asks; stay keeps the edit, leave closes the form', async ({ page }) => {
  // reach it in the app (not page.goto) so back is a router navigation, as for a user;
  // signing in reloads the app, so start from a second in-app page
  await page.locator('.fox-nav').getByText('Defects').click()
  await page.waitForURL('**/defects')
  await page.locator('.fox-nav').getByText('Test Cases').click()
  await page.waitForURL('**/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()
  await page.getByLabel('เปิด TC-101', { exact: true }).click()
  const name = page.locator('#tc-name')
  await expect(name).toBeVisible()
  await name.fill('ชื่อที่แก้แล้ว')

  await page.goBack()
  await expect(prompt(page)).toBeVisible()
  await prompt(page).getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(prompt(page)).toBeHidden()
  await expect(name).toHaveValue('ชื่อที่แก้แล้ว')
  await expect(page).toHaveURL(/\/test-cases/)

  await page.goBack()
  await prompt(page).getByRole('button', { name: 'ออกโดยไม่บันทึก' }).click()
  await expect(name).toBeHidden()
  await expect(page).toHaveURL(/\/test-cases/)
})

test('a form opened and left unchanged does not ask', async ({ page }) => {
  await page.locator('.fox-nav').getByText('Role และสิทธิ์').click()
  await page.getByRole('button', { name: 'สร้าง Role' }).click()
  await expect(page.locator('#role-name')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#role-name')).toBeHidden()
  await expect(prompt(page)).toHaveCount(0)

  await page.goto('/test-runs/run-2')
  await expect(page.locator('.exec-list__items')).toBeVisible()
  await page.locator('.fox-nav').getByText('Defects').click()
  await expect(page).toHaveURL(/\/defects/)
})

test('leaving a test run with an unsaved result asks; leave goes on to the page', async ({ page }) => {
  await page.goto('/test-runs/run-2')
  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-103' }).first().click()
  await page.getByRole('button', { name: 'ผ่านทุกขั้นตอน' }).click()

  await page.locator('.fox-nav').getByText('Defects').click()
  await expect(prompt(page)).toBeVisible()
  await prompt(page).getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(page).toHaveURL(/\/test-runs\/run-2/)

  await page.locator('.fox-nav').getByText('Defects').click()
  await prompt(page).getByRole('button', { name: 'ออกโดยไม่บันทึก' }).click()
  await expect(page).toHaveURL(/\/defects/)
})

test('closing the tab with unsaved changes triggers the browser prompt', async ({ page }) => {
  await page.goto('/test-runs/run-2')
  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-103' }).first().click()
  await page.getByRole('button', { name: 'ผ่านทุกขั้นตอน' }).click()
  const asked = new Promise<string>((resolve) => page.once('dialog', (d) => (resolve(d.type()), d.dismiss())))
  await page.close({ runBeforeUnload: true })
  expect(await asked).toBe('beforeunload')
})
