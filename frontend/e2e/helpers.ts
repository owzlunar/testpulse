import { expect, type Page } from '@playwright/test'

/** sign in from the login page by (part of) a seed user's name, then wait for the app */
export async function login(page: Page, name = 'ศุภชัย') {
  await page.goto('/login')
  // the demo cards render at once: wait until the page is interactive (its form is there)
  await expect(page.locator('#login-email')).toBeEditable()
  await page.locator('.login__user', { hasText: name }).first().click()
  // signing in reloads the app at /dashboard (also when the previous page was already the dashboard)
  await page.waitForURL((url) => url.pathname.endsWith('/dashboard'), { waitUntil: 'load' })
  await expect(page.locator('.fox-nav')).toBeVisible()
}

/** go to a page and wait until its content (not the skeleton) shows */
export async function open(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
}

/** ids of the parent case cards in the test case list, top to bottom */
export const caseIds = (page: Page) => page.locator('.tc-slot .v-chip.fox-num').allInnerTexts()

/** what the mock database holds (the app's LocalStorage) */
export const db = <T>(page: Page, key: string): Promise<T> => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key)

/** the global error toast / page snackbars */
export const toast = (page: Page) => page.locator('.v-snackbar__content')
