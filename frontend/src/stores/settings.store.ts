import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_SETTINGS, fetchSettings, saveSettings, type AppSettings } from '@/services/settings.service'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })

  async function load() {
    settings.value = await fetchSettings()
  }

  async function save(next: AppSettings) {
    settings.value = await saveSettings(next)
  }

  return { settings, load, save }
})
