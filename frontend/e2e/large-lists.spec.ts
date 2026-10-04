import { expect, test } from '@playwright/test'
import { caseIds, db, login } from './helpers'

// Cases load per project; long lists show one page of parent cases at a time

test('a long list is paged, and moving a case to the bottom takes it to the last page', async ({ page }) => {
  await login(page)
  // the dashboard stores the demo cases while it loads: add to them once they are there
  await expect.poll(() => db(page, 'testpulse_testcases')).not.toBeNull()
  // 30 more parent cases in PromptPay (33 in all)
  await page.evaluate(() => {
    const key = 'testpulse_testcases'
    const cases = JSON.parse(localStorage.getItem(key)!)
    const base = cases.find((c: { projectId: string; id: string }) => c.projectId === 'proj-1' && c.id === 'TC-104')
    for (let n = 105; n < 135; n++) cases.push({ ...base, id: `TC-${n}`, numericId: n, uid: `tc-e2e-${n}`, rev: 1, name: `เคสจำลอง ${n}` })
    localStorage.setItem(key, JSON.stringify(cases))
  })
  await page.goto('/test-cases')
  await expect(page.locator('.tc-slot')).toHaveCount(20)
  await expect(page.locator('.fox-pagination')).toBeVisible()
  expect((await caseIds(page))[0]).toBe('TC-101')

  await page.getByRole('button', { name: 'จัดลำดับ' }).click()
  const firstName = await page.locator('.tc-slot').first().locator('h3').innerText()
  await page.locator('.tc-slot').first().getByLabel('ย้ายไปล่างสุด').click()
  await expect(page.locator('.tc-slot').first().locator('h3')).not.toHaveText(firstName)
  await page.keyboard.press('Escape')

  await page
    .locator('.fox-pagination')
    .getByRole('button', { name: /หน้าสุดท้าย|last/i })
    .or(page.locator('.fox-pagination .v-btn').last())
    .first()
    .click()
  await expect(page.locator('.tc-slot').last().locator('h3')).toHaveText(firstName)
  expect((await caseIds(page)).at(-1)).toBe('TC-133')
})

test('switching project loads its cases; search finds a case in another project and opens it', async ({ page }) => {
  await login(page)
  await page.goto('/test-cases')
  await expect(page.locator('.tc-slot').first()).toBeVisible()

  await page.locator('.v-app-bar input').first().fill('TC-201')
  const hit = page.locator('.v-overlay--active .v-list-item', { hasText: 'TC-201' }).first()
  await expect(hit).toBeVisible()
  await hit.click()
  await expect(page.locator('.v-bottom-sheet h2')).toContainText('TC-201')
  await page.locator('.v-bottom-sheet').getByRole('button', { name: 'ยกเลิก' }).click()
  expect(await caseIds(page)).toContain('TC-201') // the other project's list is now loaded
})

test('the search results page loads more matches as it scrolls; a case made since the list loaded still opens', async ({ page }) => {
  await login(page)
  await expect.poll(() => db(page, 'testpulse_testcases')).not.toBeNull()
  // 30 cases named "เคสจำลอง …" in PromptPay
  await page.evaluate(() => {
    const key = 'testpulse_testcases'
    const cases = JSON.parse(localStorage.getItem(key)!)
    const base = cases.find((c: { projectId: string; id: string }) => c.projectId === 'proj-1' && c.id === 'TC-104')
    for (let n = 105; n < 135; n++) cases.push({ ...base, id: `TC-${n}`, numericId: n, uid: `tc-e2e-${n}`, rev: 1, name: `เคสจำลอง ${n}` })
    localStorage.setItem(key, JSON.stringify(cases))
  })
  // no reload: the app's list doesn't have them yet (as if someone else made them since)

  await page.locator('.v-app-bar input').first().fill('เคสจำลอง')
  await page.getByRole('button', { name: 'ดูทั้งหมด Test Cases' }).click()
  await page.waitForURL(/\/search\?q=.+&type=cases$/)
  const hits = page.locator('.search-hit')
  await expect(hits).toHaveCount(20)
  // scroll to the end until the next page is there
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 4000)
      return hits.count()
    })
    .toBe(30)
  await expect(page.getByText('แสดงครบ 30 รายการแล้ว')).toBeVisible()

  await hits.filter({ hasText: 'TC-134' }).click()
  await expect(page.locator('.v-bottom-sheet h2')).toContainText('TC-134')
})
