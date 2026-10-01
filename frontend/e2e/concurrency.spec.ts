import { expect, test } from '@playwright/test'
import { db, login, toast } from './helpers'

// Two tabs share the mock database (LocalStorage) like two users share the server:
// the second save of the same case must be refused, not silently overwrite the first.

type StoredCase = { id: string; projectId: string; name: string }
// two tabs each: run one at a time so timing stays predictable
test.describe.configure({ mode: 'serial' })

const nameOf = async (page: import('@playwright/test').Page, id: string) =>
  (await db<StoredCase[]>(page, 'testpulse_testcases')).find((c) => c.projectId === 'proj-1' && c.id === id)?.name

test('a save based on an outdated copy is refused and the list reloads', async ({ context }) => {
  const a = await context.newPage()
  await login(a)
  await a.goto('/test-cases')
  const b = await context.newPage()
  await b.goto('/test-cases')

  // A opens TC-104; meanwhile B renames it
  await a.getByLabel('เปิด TC-104', { exact: true }).click()
  await b.getByLabel('เปิด TC-104', { exact: true }).click()
  await b.fill('#tc-name', 'แก้โดยแท็บ B')
  await b.locator('.v-bottom-sheet').getByRole('button', { name: 'บันทึก' }).click()
  await expect.poll(() => nameOf(b, 'TC-104')).toBe('แก้โดยแท็บ B')

  await a.fill('#tc-name', 'แก้โดยแท็บ A')
  await a.locator('.v-bottom-sheet').getByRole('button', { name: 'บันทึก' }).click()
  await expect(toast(a).filter({ hasText: 'ถูกแก้ไขโดย' })).toBeVisible()
  expect(await nameOf(a, 'TC-104')).toBe('แก้โดยแท็บ B')
  await a.locator('.v-bottom-sheet').getByRole('button', { name: 'ยกเลิก' }).click()
  await expect(a.locator('.tc-slot h3', { hasText: 'แก้โดยแท็บ B' })).toBeVisible() // reloaded
})

test('a form opened before someone reordered cannot write into the case that now has its id', async ({ context }) => {
  const a = await context.newPage()
  await login(a)
  await a.goto('/test-cases')
  const b = await context.newPage()
  await b.goto('/test-cases')

  await a.getByLabel('เปิด TC-101', { exact: true }).click()
  // B moves the last case (Webhook) to the top: TC-101 now names the Webhook case
  await b.getByRole('button', { name: 'จัดลำดับ' }).click()
  await b.locator('.tc-slot').last().getByLabel('ย้ายไปบนสุด').click()
  await expect(b.locator('.tc-slot').first().locator('h3')).toContainText('Webhook')
  // the list moves at once (optimistic); wait until the server has the new order
  await expect.poll(() => nameOf(b, 'TC-101')).toContain('Webhook')

  await a.fill('#tc-name', 'ควรถูกปฏิเสธ')
  await a.locator('.v-bottom-sheet').getByRole('button', { name: 'บันทึก' }).click()
  await expect(toast(a).filter({ hasText: 'จัดลำดับใหม่' })).toBeVisible()
  expect(await nameOf(a, 'TC-101')).toContain('Webhook')
  expect(await nameOf(a, 'TC-102')).not.toBe('ควรถูกปฏิเสธ')
})
