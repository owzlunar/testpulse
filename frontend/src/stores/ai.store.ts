import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { aiApi as api, apiOn } from '@/api'

// Whether the server has a language model set up: the AI buttons show only then (loaded at start-up)
export const useAiStore = defineStore('ai', () => {
  const enabled = ref(false)
  const model = ref<string>()
  /** the module is on and the server has a model: show the AI actions */
  const available = computed(() => apiOn.ai && enabled.value)

  /** never fails start-up: without an answer the AI stays hidden */
  async function load() {
    try {
      const status = await api.fetchAiStatus()
      enabled.value = status.enabled
      model.value = status.model
    } catch {
      enabled.value = false
    }
  }

  return { enabled, model, available, load }
})
