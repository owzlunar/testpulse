import type { AppSettings } from '@/types'
import { respond } from './http'
import { STORAGE_KEYS, load, save } from './storage.service'

export type { AppSettings }

export const DEFAULT_SETTINGS: AppSettings = {
  alertOnModification: true,
  alertOnStatusChange: true,
  alertOnExpiry: true,
  expiryDaysThreshold: 3,
  obsidianFrontmatter: true,
  obsidianCallouts: true,
  obsidianWikilinks: true,
  stickyPageHeader: true,
}

/** GET /me/settings */
export const fetchSettings = () => respond(() => ({ ...DEFAULT_SETTINGS, ...load(STORAGE_KEYS.settings, DEFAULT_SETTINGS) }))

/** PUT /me/settings */
export const saveSettings = (settings: AppSettings) => respond(() => (save(STORAGE_KEYS.settings, settings), settings))
