<script setup lang="ts">
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import type { TestCaseStatus } from '@/types'

// "สถานะ ▾" button listing the statuses the current role may set
withDefaults(defineProps<{ status: TestCaseStatus; size?: 'x-small' | 'small' | 'default' }>(), { size: 'small' })
const emit = defineEmits<{ change: [status: TestCaseStatus] }>()

const { allowedStatuses } = useTestCasePermissions()
</script>

<template>
  <v-menu v-if="allowedStatuses.length" location="bottom end">
    <template #activator="{ props }">
      <v-btn v-bind="props" variant="tonal" :size="size" append-icon="tabler:chevron-down">สถานะ</v-btn>
    </template>
    <v-list min-width="240">
      <v-list-item
        v-for="s in allowedStatuses"
        :key="s.value"
        :active="s.value === status"
        :color="s.tone"
        :prepend-icon="s.icon"
        :title="s.label"
        :subtitle="s.hint"
        @click="s.value !== status && emit('change', s.value)"
      />
    </v-list>
  </v-menu>
</template>
