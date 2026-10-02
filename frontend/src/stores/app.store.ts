import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useNotificationStore } from './notification.store'
import { useProjectStore } from './project.store'
import { useSettingsStore } from './settings.store'
import { useTestCaseStore } from './test-case.store'
import { ApiError, errorMessage } from '@/api/errors'
import { SESSION_EXPIRED } from '@/api/session'

// App start-up (initial API calls) and the global error toast
export const useAppStore = defineStore('app', () => {
  const ready = ref(false)
  const failed = ref('')
  /** no session (fresh browser, signed out, or it expired): the router sends the user to /login */
  const signedOut = ref(false)
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
        await Promise.all([useSettingsStore().load(), useProjectStore().load(), useAuditStore().load(), useNotificationStore().load()])
        // cases load per project: the selected one now, others when opened
        await useTestCaseStore().ensureProject(useProjectStore().currentProject?.id)
        ready.value = true
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) signedOut.value = true
        else failed.value = errorMessage(e)
        booting = null
      }
    })()
    return booting
  }

  // a request found the session gone (refresh failed): start again at the login page
  window.addEventListener(SESSION_EXPIRED, () => {
    if (signedOut.value) return
    signedOut.value = true
    window.location.assign(new URL('login', document.baseURI).href)
  })

  return { ready, failed, signedOut, toast, showError, bootstrap }
})
