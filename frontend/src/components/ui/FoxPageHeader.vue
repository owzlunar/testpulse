<script setup lang="ts">
// Page title block used at the top of every page.
//   <FoxPageHeader title="ปฏิทิน" :breadcrumbs="[{ title: 'ปฏิทิน' }]">
//     <template #actions> ...buttons... </template>
//   </FoxPageHeader>
// `sticky` (long pages): stays under the app bar while scrolling and turns compact once it sticks.
// Users can turn it off in Settings (stickyPageHeader); it only applies from md up.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDisplay } from 'vuetify'
import { useSettingsStore } from '@/stores/settings.store'
import type { Breadcrumb } from '@/types'

const props = withDefaults(
  defineProps<{
    title: string
    /** small line above the title (e.g. "ยินดีต้อนรับ ...") */
    eyebrow?: string
    /** a home icon is prepended automatically */
    breadcrumbs?: Breadcrumb[]
    /** keep the header visible while the page scrolls (if enabled in Settings) */
    sticky?: boolean
  }>(),
  { eyebrow: '', breadcrumbs: () => [], sticky: false },
)

const { settings } = storeToRefs(useSettingsStore())
const { mdAndUp } = useDisplay()
const isSticky = computed(() => props.sticky && settings.value.stickyPageHeader && mdAndUp.value)

// "stuck" = the page has scrolled past the header's natural place (a 1px sentinel just above it)
const sentinel = ref<HTMLElement>()
const stuck = ref(false)
let observer: IntersectionObserver | null = null

function observe() {
  observer?.disconnect()
  observer = null
  stuck.value = false
  if (!isSticky.value || !sentinel.value) return
  const appBar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fox-appbar-height'), 10) || 72
  observer = new IntersectionObserver(([entry]) => (stuck.value = !entry.isIntersecting && entry.boundingClientRect.top < appBar), {
    rootMargin: `-${appBar}px 0px 0px 0px`,
  })
  observer.observe(sentinel.value)
}

watch([isSticky, sentinel], observe, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())

// compact actions while stuck: smaller buttons through Vuetify defaults (not per-page CSS)
const STUCK_DEFAULTS = { VBtn: { size: 'small' }, VBtnToggle: { density: 'compact' } }
</script>

<template>
  <div v-if="isSticky" ref="sentinel" class="fox-page-header__sentinel" aria-hidden="true" />
  <header class="fox-page-header" :class="{ 'fox-page-header--sticky': isSticky, 'fox-page-header--stuck': isSticky && stuck }">
    <div class="fox-page-header__text">
      <template v-if="!(isSticky && stuck)">
        <v-breadcrumbs v-if="breadcrumbs.length" class="fox-breadcrumbs mb-1" :items="breadcrumbs">
          <template #prepend>
            <router-link to="/" class="d-inline-flex text-muted mr-1" aria-label="หน้าหลัก">
              <v-icon icon="tabler:home" size="16" />
            </router-link>
            <span class="mr-1">/</span>
          </template>
        </v-breadcrumbs>
        <div v-else-if="eyebrow" class="text-subtitle-1 text-muted">{{ eyebrow }}</div>
      </template>
      <h1 :class="isSticky && stuck ? 'text-h5' : 'text-h1'">{{ title }}</h1>
    </div>
    <div v-if="$slots.actions" class="fox-page-header__actions">
      <v-defaults-provider :defaults="isSticky && stuck ? STUCK_DEFAULTS : undefined">
        <slot name="actions" />
      </v-defaults-provider>
    </div>
  </header>
</template>

<style scoped>
.fox-page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: var(--fox-gutter);
}

.fox-page-header__text {
  min-width: 0;
}

.fox-page-header__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.fox-page-header__sentinel {
  height: 1px;
  margin-bottom: -1px;
}

/* sticks under the app bar; spans the page gutters so cards don't show at its sides */
.fox-page-header--sticky {
  position: sticky;
  top: var(--fox-appbar-height);
  z-index: 5;
  margin-inline: calc(-1 * var(--fox-gutter));
  padding-inline: var(--fox-gutter);
  background: rgb(var(--v-theme-background));
  transition: padding 0.15s;
}

.fox-page-header--stuck {
  align-items: center;
  gap: 12px;
  padding-block: 10px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.fox-page-header--stuck .fox-page-header__actions {
  gap: 8px;
}
</style>
