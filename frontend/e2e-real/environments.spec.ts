import { expect, test, type Page } from '@playwright/test'
import { ACCOUNTS, signIn, toast } from './helpers'

// Environments on the backend: the payment project is tested on TEST (primary: the cases' status) and
// on the customer's STAGING (its own results; the Infra team runs it). Seeded: TC-101 passed on TEST,
// TC-104 not.

/** the payment project (projects made by earlier tests come first in the list) */
async function selectPaymentProject(page: Page) {
  await page.getByLabel('ค้นหาทั้งระบบ').fill('PromptPay & QR')
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'PromptPay & QR Payment Gateway v3' }).click()
  await page.waitForURL('**/test-cases')
}

const slotOf = (page: Page, id: string) => page.locator('.tc-slot', { has: page.getByLabel(`เปิด ${id}`, { exact: true }) })

/** picks an item of a v-select by its label */
async function choose(page: Page, label: string, item: string) {
  await page.locator('.v-field', { has: page.getByLabel(label, { exact: true }) }).click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: item }).first().click()
}

test('a result on STAGING is kept there: the case status stays the TEST one, the list shows both', async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  await selectPaymentProject(page)
  const statusOf104 = () => slotOf(page, 'TC-104').locator('.v-chip').nth(1)
  const before = await statusOf104().innerText()
  await expect(slotOf(page, 'TC-101').locator('.v-chip').nth(1)).toHaveText('Passed')
  await page.locator('.fox-nav').getByText('รอบการทดสอบ').click()
  await page.getByRole('button', { name: 'สร้างรอบการทดสอบ' }).first().click()
  const dialog = page.locator('.v-dialog')
  await dialog.locator('#run-name').fill('UAT ลูกค้า')
  await dialog.locator('.v-field', { has: page.locator('#run-env') }).click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'STAGING' }).click()
  // another environment offers what already passed on TEST
  await expect(dialog.locator('.v-chip', { hasText: 'ผ่านบน TEST แล้ว' })).toBeVisible()
  await dialog.getByRole('button', { name: 'ล้าง' }).click()
  await dialog.locator('.run-case', { hasText: 'TC-104' }).click()
  await dialog.getByRole('button', { name: /สร้างรอบ \(1 เคส\)/ }).click()
  await page.waitForURL(/\/test-runs\/run-[\w-]+$/)

  await page.locator('.exec-list__items .v-list-item', { hasText: 'TC-104' }).first().click()
  await expect(page.getByText('ไม่เปลี่ยนสถานะหลักของเคส')).toBeVisible()
  await page.getByRole('button', { name: 'ผ่านทุกขั้นตอน' }).click()
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(toast(page).filter({ hasText: 'บันทึกผล TC-104' })).toBeVisible()

  await page.goto('/test-cases')
  await expect(statusOf104()).toHaveText(before)
  await expect(slotOf(page, 'TC-104').locator('.v-chip', { hasText: 'STAGING Pass' })).toBeVisible()

  await choose(page, 'กรองตาม Environment', 'ผ่านบน TEST แต่ยังไม่ผ่านบน STAGING')
  await expect(slotOf(page, 'TC-101')).toBeVisible()
  await expect(slotOf(page, 'TC-104')).toHaveCount(0)
})

test('a server problem on STAGING goes to the Infra team, not to Dev', async ({ page, browser }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  await selectPaymentProject(page)
  await page.locator('.fox-nav').getByText('Defects', { exact: true }).click()
  await page.getByRole('button', { name: 'รายงาน Defect' }).first().click()
  const dialog = page.locator('.v-dialog')
  await dialog.locator('#df-title').fill('WAF บล็อก Webhook ของธนาคาร')
  await dialog.locator('#df-act').fill('403 จาก WAF')
  await dialog.locator('.v-field', { has: page.locator('#df-env') }).click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'STAGING' }).click()
  await dialog.getByRole('button', { name: 'Server / Environment' }).click()
  await dialog.getByRole('button', { name: 'รายงาน Defect' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('tr', { hasText: 'WAF บล็อก Webhook ของธนาคาร' })).toContainText('STAGING')

  const ops = await (await browser.newContext()).newPage()
  await signIn(ops, ACCOUNTS.ops.email)
  await ops.getByRole('button', { name: 'การแจ้งเตือน', exact: true }).click()
  await expect(ops.locator('.notif__item', { hasText: 'WAF บล็อก Webhook ของธนาคาร' })).toBeVisible()
})

test('an Admin gives a project its environments; the primary one moves and is kept', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email)
  await page.getByRole('button', { name: 'สร้างโปรเจกต์' }).first().click()
  const dialog = page.locator('.v-dialog')
  await dialog.locator('#pj-key').fill('HR')
  await dialog.locator('#pj-name').fill('HR Self-service')
  // a new project starts with TEST
  await expect(dialog.getByLabel('ชื่อ Environment').first()).toHaveValue('TEST')
  await dialog.getByRole('button', { name: 'เพิ่ม Environment' }).click()
  await expect(dialog.getByLabel('ชื่อ Environment').nth(1)).toHaveValue('STAGING')
  await dialog.getByRole('button', { name: 'ตั้งเป็นหลัก' }).click()
  await dialog.getByRole('button', { name: 'สร้างโปรเจกต์' }).click()
  await expect(toast(page)).toContainText('สร้างโปรเจกต์แล้ว')

  await page.reload()
  await page.locator('.project-card', { hasText: 'HR Self-service' }).getByLabel('ตัวเลือกโปรเจกต์').click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'แก้ไขโปรเจกต์' }).click()
  // one row per environment (the form's own row holds them all)
  const rows = dialog.locator('.v-row.align-center', { has: page.getByLabel('ชื่อ Environment') })
  await expect(rows.filter({ has: page.locator('.v-chip', { hasText: 'หลัก' }) }).getByLabel('ชื่อ Environment')).toHaveValue('STAGING')
  await expect(rows.filter({ has: page.getByRole('button', { name: 'ตั้งเป็นหลัก' }) }).getByLabel('ชื่อ Environment')).toHaveValue('TEST')
})
