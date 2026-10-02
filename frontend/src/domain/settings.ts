import type { AppSettings } from '@/types'

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
