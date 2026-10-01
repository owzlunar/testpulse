import { expect, test } from '@playwright/test'
import { db, login } from './helpers'

// A notification reaches its audience only: a failed case goes to the developer assigned to it

const openBell = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: 'การแจ้งเตือน', exact: true }).click()
  return page.locator('.notif__item')
}

test('a failed verdict notifies the assigned developer, not the other developers', async ({ page }) => {
  await login(page) // Admin marks TC-104 (assigned to ธนากร) as failed
  await page.goto('/test-cases')
  await page.locator('.tc-slot', { hasText: 'TC-104' }).getByRole('button', { name: 'สถานะ' }).click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'Failed' }).click()
  await expect(page.locator('.tc-slot', { hasText: 'TC-104' }).getByText('Failed')).toBeVisible()
  // the mock writes alerts in the background (a backend creates them in the same request): wait for it
  await expect
    .poll(async () => (await db<{ title: string }[]>(page, 'testpulse_notifications')).some((n) => n.title === 'Test Case ไม่ผ่านการทดสอบ'))
    .toBe(true)

  await login(page, 'ธนากร')
  await expect((await openBell(page)).filter({ hasText: 'Test Case ไม่ผ่านการทดสอบ' })).toHaveCount(1)

  await login(page, 'กิตติศักดิ์')
  await expect((await openBell(page)).first()).toBeVisible()
  await expect((await openBell(page)).filter({ hasText: 'Test Case ไม่ผ่านการทดสอบ' })).toHaveCount(0)
})

test('reading a notification marks it read for that person only', async ({ page }) => {
  await login(page, 'ธนากร')
  const items = await openBell(page)
  const first = items.first()
  const title = (await first.locator('.text-subtitle-2, .notif__title').first().innerText()).trim()
  await expect(first).toHaveClass(/notif__item--unread/)
  await first.click()
  await login(page, 'ธนากร')
  await expect((await openBell(page)).filter({ hasText: title }).first()).not.toHaveClass(/notif__item--unread/)

  await login(page, 'กิตติศักดิ์')
  const theirs = (await openBell(page)).filter({ hasText: title }).first()
  if (await theirs.count()) await expect(theirs).toHaveClass(/notif__item--unread/)
})
