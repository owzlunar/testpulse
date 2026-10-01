import { respond } from './http'
import { STORAGE_KEYS, load, save } from './storage.service'

export interface AppSettings {
  alertOnModification: boolean
  alertOnStatusChange: boolean
  alertOnExpiry: boolean
  /** warn this many days before a due date */
  expiryDaysThreshold: number
  obsidianFrontmatter: boolean
  obsidianCallouts: boolean
  obsidianWikilinks: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  alertOnModification: true,
  alertOnStatusChange: true,
  alertOnExpiry: true,
  expiryDaysThreshold: 3,
  obsidianFrontmatter: true,
  obsidianCallouts: true,
  obsidianWikilinks: true,
}

/** GET /me/settings */
export const fetchSettings = () => respond(() => ({ ...DEFAULT_SETTINGS, ...load(STORAGE_KEYS.settings, DEFAULT_SETTINGS) }))

/** PUT /me/settings */
export const saveSettings = (settings: AppSettings) => respond(() => (save(STORAGE_KEYS.settings, settings), settings))
