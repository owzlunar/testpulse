import type { AppSettings } from '#contract/types.js'
import { settingsRepository } from './settings.repository.js'

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

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]
const pick = (doc: Partial<AppSettings> | null): AppSettings =>
  Object.fromEntries(KEYS.map((k) => [k, doc?.[k] ?? DEFAULT_SETTINGS[k]])) as unknown as AppSettings

export const settingsService = {
  /** the defaults, overridden by what the user saved */
  get: async (userId: string): Promise<AppSettings> => pick(await settingsRepository.find(userId)),

  save: async (userId: string, settings: AppSettings): Promise<AppSettings> => pick(await settingsRepository.upsert(userId, settings)),
}
