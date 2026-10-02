<script setup lang="ts">
import { computed } from 'vue'
import type { TestCaseStatus } from '@/types'
import { statusOf } from '@/domain/test-case'

const props = withDefaults(defineProps<{ status: TestCaseStatus; size?: 'x-small' | 'small' | 'default'; variant?: 'flat' | 'tonal' }>(), {
  size: 'small',
  variant: 'tonal',
})
const option = computed(() => statusOf(props.status))
</script>

<template>
  <v-chip :color="option.tone" :size="size" :variant="variant" :prepend-icon="option.icon">{{ option.label }}</v-chip>
</template>
