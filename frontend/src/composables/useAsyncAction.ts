import { ref } from 'vue'
import { useAppStore } from '@/stores/app.store'

// Wraps an API call for a button / dialog:  const { busy, run } = useAsyncAction()
//   <v-btn :loading="busy" @click="run(() => store.save(x), () => notify('saved'))">
// Errors go to the global toast (or to `onError`, e.g. a form's own message); returns true when the
// call succeeded.
export function useAsyncAction(options: { onError?: (e: unknown) => void } = {}) {
  const busy = ref(false)
  const app = useAppStore()

  async function run<T>(action: () => Promise<T>, onSuccess?: (result: T) => void): Promise<boolean> {
    busy.value = true
    try {
      const result = await action()
      onSuccess?.(result)
      return true
    } catch (e) {
      if (options.onError) options.onError(e)
      else app.showError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  return { busy, run }
}
