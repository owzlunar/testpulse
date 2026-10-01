<script setup lang="ts">
// Title + subtitle row used inside cards, with an optional slot on the right.
withDefaults(defineProps<{ title: string; subtitle?: string }>(), { subtitle: '' })
</script>

<template>
  <div class="fox-card-header">
    <div class="fox-card-header__text">
      <h2 class="text-h5">{{ title }}</h2>
      <p v-if="subtitle" class="text-body-2 text-muted">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="fox-card-header__append">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.fox-card-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.fox-card-header__text {
  min-width: 0;
}

.fox-card-header__append {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
