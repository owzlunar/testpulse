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
  type Stored = { id: string; readBy?: string[] }
  const readByDev2 = async () => (await db<Stored[]>(page, 'testpulse_notifications')).find((n) => n.readBy?.includes('user-dev-2'))?.id
  /** what the API answers to the signed-in user for one notification */
  const readFor = (id: string) =>
    page.evaluate(async (nid) => {
      const path = '/src/api/mock/notification.ts' // served by the dev server
      const api = (await import(/* @vite-ignore */ path)) as { fetchNotifications: () => Promise<{ id: string; read: boolean }[]> }
      return (await api.fetchNotifications()).find((n) => n.id === nid)?.read
    }, id)

  await login(page, 'ธนากร') // user-dev-2
  const unreadItems = (await openBell(page)).and(page.locator('.notif__item--unread'))
  await expect(unreadItems.first()).toBeVisible()
  await unreadItems.first().click() // the bell toggles: don't open it again
  // the mock saves read state in the background (a backend answers first): wait for it
  await expect.poll(readByDev2).toBeTruthy()
  const id = (await readByDev2())!

  await login(page, 'ธนากร')
  expect(await readFor(id)).toBe(true)
  // user-dev-1, same team: not read for him (unread, or not addressed to him at all)
  await login(page, 'กิตติศักดิ์')
  expect(await readFor(id)).not.toBe(true)
})
