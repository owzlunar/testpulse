import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsApi } from '@/api'
import { DEFAULT_SETTINGS } from '@/domain/settings'
import type { AppSettings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })

  async function load() {
    settings.value = await settingsApi.fetchSettings()
  }

  async function save(next: AppSettings) {
    settings.value = await settingsApi.saveSettings(next)
  }

  return { settings, load, save }
})
