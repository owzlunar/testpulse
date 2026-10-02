<script setup lang="ts">
import { computed } from 'vue'
import type { TestCasePriority } from '@/types'
import { priorityOf } from '@/domain/test-case'

// Dot + label (lighter than a chip so it doesn't compete with the status chip)
const props = defineProps<{ priority: TestCasePriority }>()
const option = computed(() => priorityOf(props.priority))
</script>

<template>
  <span class="tc-priority text-caption" :class="`text-${option.tone}`">
    <span class="tc-priority__dot" />
    {{ option.label }}
  </span>
</template>

<style scoped>
.tc-priority {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  white-space: nowrap;
}

.tc-priority__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
</style>
