import { computed, nextTick, onScopeDispose, reactive, ref, watch, type Ref } from 'vue'
import type { Router } from 'vue-router'

// Leaving a form with unsaved changes asks first:
// - in-app navigation (back button, links) -> the confirm dialog in App.vue (`leavePrompt`)
// - closing / reloading the tab -> the browser's own beforeunload prompt (its text cannot be changed)

interface Guard {
  dirty: () => boolean
  /** a dialog form: leaving closes it and keeps the page (as Vuetify does for back on a clean dialog) */
  discard?: () => void
}

const guards = new Set<Guard>()
const dirtyGuards = () => [...guards].filter((g) => g.dirty())

/** state of the "leave without saving?" dialog rendered by App.vue */
export const leavePrompt = reactive({ show: false, answer: null as ((leave: boolean) => void) | null })

function askToLeave(): Promise<boolean> {
  return new Promise((resolve) => {
    leavePrompt.answer = resolve
    leavePrompt.show = true
  })
}

/** App.vue: the user picked an answer (`false` also when the dialog is dismissed) */
export function answerLeave(leave: boolean) {
  leavePrompt.show = false
  leavePrompt.answer?.(leave)
  leavePrompt.answer = null
}

/** register a page form; `dirty` is true while it has changes not saved yet */
export function useLeaveGuard(dirty: () => boolean, discard?: () => void) {
  const guard: Guard = { dirty, discard }
  guards.add(guard)
  onScopeDispose(() => guards.delete(guard))
}

/**
 * a dialog form: the values `source` returns when it opens (after its own open watcher filled them)
 * are the saved state; anything different is unsaved. Call `markClean()` after filling it asynchronously.
 */
export function useUnsavedChanges(open: Ref<boolean>, source: () => unknown) {
  const baseline = ref<string | null>(null)
  const snapshot = () => JSON.stringify(source())
  const markClean = () => (baseline.value = open.value ? snapshot() : null)
  watch(open, (isOpen) => (isOpen ? nextTick(markClean) : (baseline.value = null)), { immediate: true })
  const dirty = computed(() => open.value && baseline.value !== null && snapshot() !== baseline.value)
  useLeaveGuard(
    () => dirty.value,
    () => (open.value = false),
  )
  return { dirty, markClean }
}

/** router/index.ts: install once */
export function installLeaveGuard(router: Router) {
  // installed before the router's own popstate listener, so the flag is set when the guard runs
  let popped = false
  window.addEventListener('popstate', () => {
    popped = true
    setTimeout(() => (popped = false))
  })

  router.beforeEach(async (to, from) => {
    const back = popped
    // a page that just closed its dialog (saved) and navigates: let the dialog's model catch up first
    await nextTick()
    // a query change on the same page (tab, selected item, clearing a deep link) keeps every form;
    // only back / forward still closes a dialog form (Vuetify does that on any history step)
    const samePage = to.path === from.path
    const dirty = dirtyGuards().filter((g) => !samePage || (back && g.discard))
    if (!dirty.length) return true
    if (!(await askToLeave())) return false
    const dialogs = dirty.filter((g) => g.discard)
    dialogs.forEach((g) => g.discard!())
    // leaving a dialog form closes it; leaving a page form goes on
    return dialogs.length ? false : true
  })

  window.addEventListener('beforeunload', (e) => {
    if (!dirtyGuards().length) return
    e.preventDefault()
    e.returnValue = ''
  })
}
