import { defineStore } from 'pinia'
import { ref } from 'vue'
import { errorMessage } from '@/services/http'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useNotificationStore } from './notification.store'
import { useProjectStore } from './project.store'
import { useSettingsStore } from './settings.store'
import { useTestCaseStore } from './test-case.store'

// App start-up (initial API calls) and the global error toast
export const useAppStore = defineStore('app', () => {
  const ready = ref(false)
  const failed = ref('')
  const toast = ref({ show: false, text: '' })
  let booting: Promise<void> | null = null

  function showError(e: unknown) {
    toast.value = { show: true, text: errorMessage(e) }
  }

  /** load everything the shell needs once; pages load their own extra data */
  function bootstrap(): Promise<void> {
    booting ??= (async () => {
      try {
        failed.value = ''
        await useAuthStore().load()
        await Promise.all([
          useSettingsStore().load(),
          useProjectStore().load(),
          useTestCaseStore().load(),
          useAuditStore().load(),
          useNotificationStore().load(),
        ])
        ready.value = true
      } catch (e) {
        failed.value = errorMessage(e)
        booting = null
      }
    })()
    return booting
  }

  return { ready, failed, toast, showError, bootstrap }
})
