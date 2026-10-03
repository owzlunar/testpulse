import { expect, type Page } from '@playwright/test'

/** seeded by the backend (the seed file of each module) */
export const PASSWORD = 'password123'
export const ACCOUNTS = {
  admin: { email: 'admin@testpulse.dev', name: 'ศุภชัย วัฒนา (Admin)' },
  qaLead: { email: 'somchai.qa@testpulse.dev', name: 'สมชาย ประเสริฐ (QA Lead)' }, // team Payment: proj-1, proj-3
  tester: { email: 'pitchaya.qa@testpulse.dev', name: 'พิชญา ศรีสุข (Senior Tester)' }, // team E-Commerce: proj-2, proj-3
  developer: { email: 'kittisak.dev@testpulse.dev', name: 'กิตติศักดิ์ พัฒนา (Dev Lead)' }, // team Payment: proj-1, proj-3
} as const

/** sign in through the login form, as a person would */
export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-pw').fill(password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click()
  await page.waitForURL('**/dashboard')
  await expect(page.locator('.fox-nav')).toBeVisible()
}

export const toast = (page: Page) => page.locator('.v-snackbar__content')

interface MailpitMessage {
  ID: string
  To: { Address: string }[]
  Subject: string
}

/** the newest invite link mailed to `email` (Mailpit) */
export async function inviteLinkFor(email: string): Promise<string> {
  let found: MailpitMessage | undefined
  await expect
    .poll(async () => {
      const list = (await (await fetch('http://localhost:8025/api/v1/messages')).json()) as { messages: MailpitMessage[] }
      found = list.messages.find((m) => m.To.some((t) => t.Address === email))
      return !!found
    })
    .toBe(true)
  const message = (await (await fetch(`http://localhost:8025/api/v1/message/${found!.ID}`)).json()) as { Text: string }
  return /https?:\/\/\S+\/invite\/[\w-]+/.exec(message.Text)![0]
}
