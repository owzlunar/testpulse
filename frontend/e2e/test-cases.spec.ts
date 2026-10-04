import { expect, test } from '@playwright/test'
import { caseIds, db, login } from './helpers'

type StoredCase = { id: string; projectId: string; name: string; version: string; status: string; archivedAt?: string; steps: { action: string }[] }
const payCases = async (page: import('@playwright/test').Page) =>
  ((await db<StoredCase[] | null>(page, 'testpulse_testcases')) ?? []).filter((c) => c.projectId === 'proj-1')

test.beforeEach(async ({ page }) => {
  await login(page)
  await page.goto('/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()
})

test.describe('reorder mode', () => {
  test('grips and move buttons only show in the mode; card actions hide; Esc leaves', async ({ page }) => {
    await expect(page.locator('.tc-grip')).toHaveCount(0)
    await page.getByRole('button', { name: 'จัดลำดับ' }).click()
    await expect(page.locator('.tc-reorder-bar')).toBeVisible()
    await expect(page.locator('.tc-slot [aria-label^="เปิด TC"]')).toHaveCount(0)
    await expect(page.locator('input[aria-label="ค้นหา Test Case"]')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(page.locator('.tc-reorder-bar .v-snackbar__wrapper')).toHaveCount(0)
    await expect(page.locator('.tc-slot [aria-label^="เปิด TC"]').first()).toBeVisible()
  })

  test('"ล่างสุด" and "ย้ายไป… ก่อน" move a case and renumber ids', async ({ page }) => {
    await page.getByRole('button', { name: 'จัดลำดับ' }).click()
    const first = page.locator('.tc-slot').first()
    const firstName = await first.locator('h3').innerText()
    await first.getByLabel('ย้ายไปล่างสุด').click()
    await expect(page.locator('.tc-slot').last().locator('h3')).toHaveText(firstName)
    await expect.poll(() => caseIds(page)).toEqual(['TC-101', 'TC-102', 'TC-103'])

    await page.locator('.tc-slot').last().getByLabel('ย้ายไปก่อน / หลังเคสอื่น').click()
    await page.locator('.v-overlay--active .v-list-item').first().getByRole('button', { name: 'ก่อน' }).click()
    await expect(page.locator('.tc-slot').first().locator('h3')).toHaveText(firstName)
  })

  test('drag and drop inserts between cards; runs and defects follow the renumbered case', async ({ page }) => {
    await page.getByRole('button', { name: 'จัดลำดับ' }).click()
    const slots = page.locator('.tc-slot')
    const lastName = await slots.last().locator('h3').innerText()
    const dt = await page.evaluateHandle(() => new DataTransfer())
    const box = (await slots.first().boundingBox())!
    const at = { dataTransfer: dt, clientX: box.x + 200, clientY: box.y + 5 }
    await slots.last().locator('.tc-card > .fox-card-body .tc-grip').dispatchEvent('dragstart', { dataTransfer: dt })
    await slots.first().dispatchEvent('dragover', at)
    await slots.first().dispatchEvent('drop', at)
    await expect(slots.first().locator('h3')).toHaveText(lastName)
    await expect
      .poll(async () => (await db<{ id: string; caseId: string }[] | null>(page, 'testpulse_defects'))?.find((d) => d.id === 'BUG-003')?.caseId)
      .toBe('TC-101')
  })
})

test('a new case goes to the end of the list, also after a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'สร้าง Test Case' }).first().click()
  await page.locator('.v-overlay--active .v-list-item').first().click()
  await page.fill('#tc-name', 'เคสใหม่ e2e')
  await page.fill('#tc-req', 'ทดสอบ')
  await page.fill('#tc-scenario', 'ทดสอบ')
  await page.getByRole('tab', { name: 'ผลลัพธ์' }).click()
  await page.fill('#tc-expected', 'ok')
  await page.locator('.v-bottom-sheet').getByRole('button', { name: 'สร้าง Test Case' }).click()
  await expect.poll(() => caseIds(page)).toEqual(['TC-101', 'TC-103', 'TC-104', 'TC-105'])
  await page.reload()
  await expect.poll(() => caseIds(page)).toEqual(['TC-101', 'TC-103', 'TC-104', 'TC-105'])
})

test('archive shows the impact, hides the case, keeps its id; restore and permanent delete', async ({ page }) => {
  await page.getByLabel('ตัวเลือก TC-104').click()
  await page.getByText('เก็บเข้าคลัง', { exact: true }).click()
  await expect(page.locator('.remove-impact')).toContainText('BUG-003')
  await expect(page.locator('.remove-impact')).toContainText('REQ-PAY-04 จะไม่เหลือ Test Case ครอบคลุม')
  await page.locator('.v-dialog').getByRole('button', { name: 'เก็บเข้าคลัง' }).click()
  await expect.poll(() => caseIds(page)).toEqual(['TC-101', 'TC-103'])

  await page.getByRole('button', { name: 'คลังเก็บ' }).click()
  await page.locator('.v-btn', { hasText: 'กู้คืน' }).click()
  await expect.poll(async () => (await payCases(page)).find((c) => c.id === 'TC-104')?.archivedAt).toBeUndefined()

  await page.getByRole('button', { name: 'ใช้งานอยู่' }).click()
  await page.getByLabel('ตัวเลือก TC-104').click()
  await page.getByText('เก็บเข้าคลัง', { exact: true }).click()
  await page.locator('.v-dialog').getByRole('button', { name: 'เก็บเข้าคลัง' }).click()
  await page.getByRole('button', { name: 'คลังเก็บ' }).click()
  await page.getByLabel('ลบถาวร TC-104').click()
  await page.locator('.v-dialog').getByRole('button', { name: 'ลบถาวร' }).click()
  await expect.poll(async () => (await payCases(page)).map((c) => c.id)).not.toContain('TC-104')
  const bug3 = (await db<{ id: string; caseDeleted?: boolean }[]>(page, 'testpulse_defects')).find((d) => d.id === 'BUG-003')
  expect(bug3?.caseDeleted).toBe(true)
})

test('editing the spec of a passed case warns, makes a new version and cancels the pass; old versions restore', async ({ page }) => {
  await page.getByLabel('เปิด TC-101', { exact: true }).click()
  await page.getByRole('tab', { name: 'ขั้นตอน' }).click()
  await page.locator('.tc-step-text').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type('\nบรรทัดที่สอง')
  await page.locator('.v-bottom-sheet h2').click()
  await expect(page.locator('.tc-step-text').first()).toContainText('บรรทัดที่สอง') // multi-line, input hidden again
  await expect(page.locator('.v-bottom-sheet .v-alert', { hasText: 'ผลผ่าน' })).toBeVisible()
  await page.locator('.v-bottom-sheet').getByRole('button', { name: 'บันทึก' }).click()
  await expect.poll(async () => (await payCases(page)).find((c) => c.id === 'TC-101')).toMatchObject({ version: 'v1.3', status: 'ready_for_test' })

  await page.getByLabel('ตัวเลือก TC-101', { exact: true }).click()
  await page.getByText('ประวัติและ Audit').click()
  await page.locator('.v-btn', { hasText: 'เทียบกับปัจจุบัน' }).first().click()
  await page.locator('.v-btn', { hasText: 'กู้คืน v1.2' }).click()
  await expect.poll(async () => (await payCases(page)).find((c) => c.id === 'TC-101')?.version).toBe('v1.4')
  const steps = (await payCases(page)).find((c) => c.id === 'TC-101')!.steps
  expect(steps[0].action).not.toContain('บรรทัดที่สอง')
})

test('cases pasted from Excel: one row per step, a row without a name continues the case above', async ({ page }) => {
  await page.getByRole('button', { name: 'สร้าง Test Case' }).first().click()
  await page.locator('.v-overlay--active .v-list-item', { hasText: 'นำเข้าจาก Excel / CSV' }).click()
  const dialog = page.locator('.v-dialog')
  const table = [
    ['Test Case', 'Action', 'Expected'],
    ['ค้นหาสินค้า', 'พิมพ์คำค้น', 'แสดงรายการที่ตรง'],
    ['', 'กดตัวกรองราคา', 'กรองตามช่วงราคา'],
  ]
  await dialog.locator('#imp-paste').fill(table.map((r) => r.join('\t')).join('\n'))
  await expect(dialog.getByText('อ่านได้ 2 แถว · 3 คอลัมน์')).toBeVisible()
  await dialog.getByRole('button', { name: 'ถัดไป' }).click()
  await dialog.getByRole('button', { name: 'ตรวจสอบ' }).click()
  await expect(dialog.getByText('รวม 2 ขั้นตอน')).toBeVisible()
  await dialog.getByRole('button', { name: 'นำเข้า 1 เคส' }).click()
  await expect.poll(() => caseIds(page)).toContain('TC-105')
})
