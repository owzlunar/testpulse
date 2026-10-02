import type { AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/domain/settings'
import { respond } from './http'
import { STORAGE_KEYS, load, save } from './storage'

/** GET /me/settings */
export const fetchSettings = () => respond(() => ({ ...DEFAULT_SETTINGS, ...load(STORAGE_KEYS.settings, DEFAULT_SETTINGS) }))

/** PUT /me/settings */
export const saveSettings = (settings: AppSettings) => respond(() => (save(STORAGE_KEYS.settings, settings), settings))

export type { AppSettings }
