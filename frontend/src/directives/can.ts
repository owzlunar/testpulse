import { shallowRef, watchEffect, type Directive, type ShallowRef } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import type { PermissionKey } from '@/types'

/** one permission, or several: any of them is enough */
type CanValue = PermissionKey | readonly PermissionKey[]

const state = new WeakMap<HTMLElement, { value: ShallowRef<CanValue>; stop: () => void }>()

function apply(el: HTMLElement, value: CanValue) {
  const allowed = useAuthStore().canAny(typeof value === 'string' ? [value] : value)
  el.style.display = allowed ? '' : 'none'
}

/**
 * Hides an action the signed-in user has no permission for:  <v-btn v-can="'defect.report'">
 * It follows the role (a change to it shows / hides the element again). Use `v-if="auth.can(...)"`
 * instead when the permission is one condition among others, or on a <template>.
 */
export const vCan: Directive<HTMLElement, CanValue> = {
  mounted(el, binding) {
    const value = shallowRef(binding.value)
    const stop = watchEffect(() => apply(el, value.value))
    state.set(el, { value, stop })
  },
  updated(el, binding) {
    const s = state.get(el)
    if (!s) return
    s.value.value = binding.value
    // the component's own re-render may have rewritten the inline style
    apply(el, binding.value)
  },
  unmounted(el) {
    state.get(el)?.stop()
    state.delete(el)
  },
}

declare module 'vue' {
  interface GlobalDirectives {
    vCan: typeof vCan
  }
}
