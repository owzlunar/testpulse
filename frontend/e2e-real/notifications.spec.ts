import { expect, test, type Browser, type Page } from '@playwright/test'
import { ACCOUNTS, signIn, toast } from './helpers'

// Notifications are made by the backend with the change and reach open pages over its event stream;
// read / removed is kept per person

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await signIn(page, email)
  return page
}

const openBell = async (page: Page) => {
  await page.getByRole('button', { name: 'การแจ้งเตือน', exact: true }).click()
  return page.locator('.notif__item', { hasText: 'Mobile App' })
}

test('a new project reaches the people who can open it without a reload; read and removed per person', async ({ browser }) => {
  // the QA Lead's page is open before the project exists
  const qa = await signedIn(browser, ACCOUNTS.qaLead.email)
  const admin = await signedIn(browser, ACCOUNTS.admin.email)

  await admin.getByRole('button', { name: 'สร้างโปรเจกต์' }).first().click()
  await admin.locator('#pj-key').fill('MOB')
  await admin.locator('#pj-name').fill('Mobile App')
  await admin.locator('.v-dialog').getByRole('button', { name: 'สร้างโปรเจกต์' }).click()
  await expect(toast(admin)).toContainText('สร้างโปรเจกต์แล้ว')

  const item = await openBell(qa)
  await expect(item).toContainText('สร้างโปรเจกต์ใหม่')
  await expect(item).toHaveClass(/notif__item--unread/)
  // the Admin made it: not told about their own change
  await expect(await openBell(admin)).toHaveCount(0)

  await item.getByLabel('ทำเครื่องหมายว่าอ่านแล้ว').click()
  await expect(item).not.toHaveClass(/notif__item--unread/)
  await qa.reload()
  await expect(await openBell(qa)).not.toHaveClass(/notif__item--unread/)

  // someone else still has it unread (the project has no team: every role may open it)
  const tester = await signedIn(browser, ACCOUNTS.tester.email)
  const theirs = await openBell(tester)
  await expect(theirs).toHaveClass(/notif__item--unread/)

  // removing it takes it off the tester's list only
  await theirs.getByLabel('ลบการแจ้งเตือน').click()
  await tester.reload()
  await expect(await openBell(tester)).toHaveCount(0)
  await qa.reload()
  await expect(await openBell(qa)).toHaveCount(1)
})
