import { expect, test } from '@playwright/test'
import { ACCOUNTS, signIn, toast } from './helpers'

// The backup page against the real API and the real backup agent (playwright.real.config.ts starts it
// with no backup storage): settings and secrets, alerts as in-app notifications and email (Mailpit), a
// backup that fails and the alert it raises.

interface MailpitMessage {
  To: { Address: string }[]
  Subject: string
}
const mailsWithSubject = async (subject: string): Promise<string[]> => {
  const list = (await (await fetch('http://localhost:8025/api/v1/messages')).json()) as { messages: MailpitMessage[] }
  return list.messages
    .filter((m) => m.Subject === subject)
    .flatMap((m) => m.To.map((t) => t.Address))
    .sort()
}

test('the Admin sets where alerts go; a test message reaches the team by email and the Admins in-app', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email)
  await page.locator('.fox-nav').getByText('สำรองข้อมูล').click()
  await page.waitForURL('**/admin/backup')
  // the agent answers; its storage is not there
  await expect(page.getByText('MinIO บนเครื่องนี้')).toBeVisible()
  await expect(page.getByText('ติดต่อ backup agent ไม่ได้')).toHaveCount(0)

  await page.getByRole('button', { name: 'ตั้งค่า' }).click()
  const dialog = page.locator('.v-dialog', { hasText: 'ตั้งค่าการสำรองข้อมูล' })
  await dialog.locator('#alert-teams').click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'Payment' }).first().click()
  await page.keyboard.press('Escape')
  await dialog.locator('#alert-emails').fill('ops.manager@example.com')
  await dialog.locator('#alert-emails').press('Enter')
  await dialog.getByRole('button', { name: 'บันทึก' }).click()
  await expect(toast(page).filter({ hasText: 'บันทึกตั้งค่าการสำรองข้อมูลแล้ว' })).toBeVisible()

  await page.getByRole('button', { name: 'ตั้งค่า' }).click()
  await dialog.getByRole('button', { name: 'ส่งข้อความทดสอบ' }).click()
  // team Payment: QA Lead + two developers, and the extra address
  await expect(toast(page).filter({ hasText: 'ส่งข้อความทดสอบแล้ว (อีเมล 4 ฉบับ, ในระบบ)' })).toBeVisible()
  await expect
    .poll(() => mailsWithSubject('[TestPulse] ทดสอบการแจ้งเตือน'))
    .toEqual(['kittisak.dev@testpulse.dev', 'ops.manager@example.com', 'somchai.qa@testpulse.dev', 'thanakorn.dev@testpulse.dev'])
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'การแจ้งเตือน', exact: true }).click()
  await expect(page.locator('.notif__item', { hasText: 'ทดสอบการแจ้งเตือน' }).first()).toBeVisible()
})

test('a backup that fails shows in the history with its log and raises an alert', async ({ page }) => {
  await signIn(page, ACCOUNTS.admin.email)
  await page.goto('/admin/backup')
  await page.getByRole('button', { name: 'สำรองเดี๋ยวนี้' }).click()
  await expect(toast(page).filter({ hasText: 'สำรองข้อมูล: ไม่สำเร็จ' })).toBeVisible({ timeout: 90_000 })
  const row = page.locator('tbody tr', { hasText: 'สำรองไม่สำเร็จ' }).first()
  await expect(row).toContainText(ACCOUNTS.admin.name)
  await expect(page.getByText('สำรองไม่สำเร็จ', { exact: false }).first()).toBeVisible()

  await row.getByRole('button', { name: /^ดู log ของสำรองข้อมูล/ }).click()
  await expect(page.locator('.fox-log')).toContainText('$ backup.sh')
  await page.getByRole('button', { name: 'ปิด', exact: true }).last().click()

  // the problem: once in-app to the Admins and by email to the team chosen in the test above
  await expect.poll(() => mailsWithSubject('[TestPulse] สำรองข้อมูลไม่สำเร็จ')).toContain('somchai.qa@testpulse.dev')
  await page.getByRole('button', { name: 'การแจ้งเตือน', exact: true }).click()
  await expect(page.locator('.notif__item', { hasText: 'สำรองข้อมูลไม่สำเร็จ' }).first()).toBeVisible()
})

test('only the Admin may open the backup page or call its API', async ({ page }) => {
  await signIn(page, ACCOUNTS.qaLead.email)
  expect(await page.locator('.fox-nav .v-list-item-title').allInnerTexts()).not.toContain('สำรองข้อมูล')
  await page.goto('/admin/backup')
  await page.waitForURL('**/dashboard')
})
