import type { SettingsApi } from '@/api/contract'
import type { AppSettings } from '@/types'
import { get, put } from './http'

export const settingsApi: SettingsApi = {
  fetchSettings: () => get<AppSettings>('/me/settings'),
  saveSettings: (settings) => put<AppSettings>('/me/settings', settings),
}
