import type { AppSettings } from '@/types'

export interface SettingsApi {
  /** GET /me/settings */
  fetchSettings(): Promise<AppSettings>

  /** PUT /me/settings */
  saveSettings(settings: AppSettings): Promise<AppSettings>
}
