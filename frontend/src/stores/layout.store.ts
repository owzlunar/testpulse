import { defineStore } from 'pinia'
import { ref } from 'vue'

// Shell state shared by the layout and pages (e.g. a page toggling the right sidebar)
export const useLayoutStore = defineStore('layout', () => {
  /** right sidebar of routes that register an `aside` view (calendar) */
  const asideOpen = ref(true)
  const notificationsOpen = ref(false)
  const helpOpen = ref(false)

  const toggleAside = () => {
    asideOpen.value = !asideOpen.value
  }

  return { asideOpen, notificationsOpen, helpOpen, toggleAside }
})
