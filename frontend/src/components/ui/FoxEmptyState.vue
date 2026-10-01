<script setup lang="ts">
withDefaults(defineProps<{ icon?: string; title: string; text?: string }>(), {
  icon: 'tabler:inbox',
  text: '',
})
</script>

<template>
  <div class="d-flex flex-column align-center text-center py-8 px-4">
    <v-avatar color="secondary" size="56" class="mb-3">
      <v-icon :icon="icon" size="26" />
    </v-avatar>
    <div class="text-subtitle-2">{{ title }}</div>
    <div v-if="text" class="text-body-2 text-muted">{{ text }}</div>
    <slot />
  </div>
</template>
