<script setup lang="ts">
// Page title block used at the top of every page.
//   <FoxPageHeader title="ปฏิทิน" :breadcrumbs="[{ title: 'ปฏิทิน' }]">
//     <template #actions> ...buttons... </template>
//   </FoxPageHeader>
import type { Breadcrumb } from '@/types'

withDefaults(
  defineProps<{
    title: string
    /** small line above the title (e.g. "ยินดีต้อนรับ ...") */
    eyebrow?: string
    /** a home icon is prepended automatically */
    breadcrumbs?: Breadcrumb[]
  }>(),
  { eyebrow: '', breadcrumbs: () => [] },
)
</script>

<template>
  <header class="fox-page-header">
    <div class="fox-page-header__text">
      <v-breadcrumbs v-if="breadcrumbs.length" class="fox-breadcrumbs mb-1" :items="breadcrumbs">
        <template #prepend>
          <router-link to="/" class="d-inline-flex text-muted mr-1" aria-label="หน้าหลัก">
            <v-icon icon="tabler:home" size="16" />
          </router-link>
          <span class="mr-1">/</span>
        </template>
      </v-breadcrumbs>
      <div v-else-if="eyebrow" class="text-subtitle-1 text-muted">{{ eyebrow }}</div>
      <h1 class="text-h1">{{ title }}</h1>
    </div>
    <div v-if="$slots.actions" class="fox-page-header__actions">
      <slot name="actions" />
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
</style>
