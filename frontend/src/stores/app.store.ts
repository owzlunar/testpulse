import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAiStore } from './ai.store'
import { useAuditStore } from './audit.store'
import { useAuthStore } from './auth.store'
import { useNotificationStore } from './notification.store'
import { useProjectStore } from './project.store'
import { useSettingsStore } from './settings.store'
import { useTestCaseStore } from './test-case.store'
import { apiOn } from '@/api'
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
        // modules that are off (rest mode, not in the backend yet) load nothing
        await Promise.all([
          useSettingsStore().load(),
          useProjectStore().load(),
          apiOn.audit ? useAuditStore().load() : undefined,
          apiOn.notification ? useNotificationStore().load() : undefined,
          apiOn.ai ? useAiStore().load() : undefined,
        ])
        // cases load per project: the selected one now, others when opened
        if (apiOn['test-case']) await useTestCaseStore().ensureProject(useProjectStore().currentProject?.id)
        // new notifications come as they happen (the backend's event stream)
        if (apiOn.notification) useNotificationStore().watch()
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
