import { ref } from 'vue'
import { useAppStore } from '@/stores/app.store'

// Wraps an API call for a button / dialog:  const { busy, run } = useAsyncAction()
//   <v-btn :loading="busy" @click="run(() => store.save(x), () => notify('saved'))">
// Errors go to the global toast; returns true when the call succeeded.
export function useAsyncAction() {
  const busy = ref(false)
  const app = useAppStore()

  async function run<T>(action: () => Promise<T>, onSuccess?: (result: T) => void): Promise<boolean> {
    busy.value = true
    try {
      const result = await action()
      onSuccess?.(result)
      return true
    } catch (e) {
      app.showError(e)
      return false
    } finally {
      busy.value = false
    }
  }

  return { busy, run }
}
