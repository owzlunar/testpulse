<script setup lang="ts">
import type { LegendItem } from '@/types'

defineProps<{ items: LegendItem[] }>()
</script>

<template>
  <ul class="fox-legend">
    <li v-for="item in items" :key="item.label" class="text-body-2">
      <span class="fox-legend__dot" :class="`bg-${item.tone}`" />
      {{ item.label }}
    </li>
  </ul>
</template>

<style scoped>
.fox-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fox-legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.fox-legend__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
</style>
