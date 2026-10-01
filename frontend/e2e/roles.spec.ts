import { expect, test } from '@playwright/test'
import { db, login } from './helpers'

type StoredRole = { id: string; name: string; builtIn?: string; permissions: string[] }
const roles = (page: import('@playwright/test').Page) => db<StoredRole[]>(page, 'testpulse_roles')

test.beforeEach(async ({ page }) => {
  await login(page)
  await page.goto('/admin/permissions')
  await expect(page.locator('.role-list__items .v-list-item').first()).toBeVisible()
})

test('permissions are a draft until saved; switching role with changes asks first', async ({ page }) => {
  await page.locator('.role-list__items .v-list-item', { hasText: 'QA Tester' }).click()
  await page.locator('.perm-editor .v-checkbox', { hasText: 'สร้างรอบ' }).first().click()
  await expect(page.locator('.role-savebar')).toContainText('ยังไม่ได้บันทึก 1 การเปลี่ยนแปลง')
  await page.locator('.role-list__items .v-list-item', { hasText: 'Developer' }).click()
  await expect(page.locator('.v-dialog')).toContainText('ทิ้งการแก้ไขสิทธิ์?')
  await page.locator('.v-dialog').getByRole('button', { name: 'ยกเลิก' }).click()
  await page.getByRole('button', { name: 'บันทึกสิทธิ์' }).click()
  await expect.poll(async () => (await roles(page)).find((r) => r.id === 'role-qa-tester')?.permissions).toContain('run.create')
  await expect(page).toHaveURL(/role=role-qa-tester/)
})

test('a copy of Admin is an ordinary role (not locked, deletable)', async ({ page }) => {
  await page.locator('.role-list__items .v-list-item', { hasText: 'Admin' }).click()
  await page.getByRole('button', { name: 'ทำสำเนา' }).click()
  await page.fill('#role-name', 'Manager')
  await page.locator('.v-dialog').getByRole('button', { name: 'สร้าง Role' }).click()
  await expect.poll(async () => (await roles(page)).find((r) => r.name === 'Manager')).toBeTruthy()
  expect((await roles(page)).find((r) => r.name === 'Manager')!.builtIn).toBeUndefined()
  await expect(page.locator('.perm-editor .v-selection-control--disabled')).toHaveCount(0)
  await expect(page.getByLabel('ลบ Role Manager')).toBeVisible()
})

test('the comparison shows the most used roles and can hide the permissions they share', async ({ page }) => {
  await page.getByRole('tab', { name: 'เปรียบเทียบสิทธิ์' }).click()
  const headers = page.locator('.role-compare thead th .v-btn')
  await expect(headers).toHaveCount(3)
  const all = await page.locator('.role-compare tbody tr').count()
  await page.getByLabel('แสดงเฉพาะสิทธิ์ที่ต่างกัน').click()
  await expect.poll(() => page.locator('.role-compare tbody tr').count()).toBeLessThan(all)
  await expect.poll(() => page.locator('.role-compare .d-sr-only', { hasText: ': มีสิทธิ์' }).count()).toBeGreaterThan(0)
})
