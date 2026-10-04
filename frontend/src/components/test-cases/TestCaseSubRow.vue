<script setup lang="ts">
import TestCaseBadges from './TestCaseBadges.vue'
import TestCaseEnvironmentChips from './TestCaseEnvironmentChips.vue'
import TestCasePriorityChip from './TestCasePriorityChip.vue'
import TestCaseStatusChip from './TestCaseStatusChip.vue'
import TestCaseStatusMenu from './TestCaseStatusMenu.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase, TestCaseStatus } from '@/types'

// One sub-case row under a parent card. Slots: `grip` and `move` (reorder mode, replace the actions).
defineProps<{ testCase: TestCase; reorderMode: boolean }>()
const emit = defineEmits<{
  edit: [tc: TestCase]
  history: [tc: TestCase]
  archive: [tc: TestCase]
  reviewed: [tc: TestCase]
}>()
defineSlots<{ grip?: () => unknown; move?: () => unknown }>()

const store = useTestCaseStore()
const { run } = useAsyncAction()
const { canEdit, canArchive } = useTestCasePermissions()

const setStatus = (tc: TestCase, s: TestCaseStatus) => run(() => store.update(tc.id, { status: s }, tc.projectId))
</script>

<template>
  <div class="tc-sub">
    <slot name="grip" />
    <div class="flex-grow-1 overflow-hidden">
      <div class="d-flex flex-wrap align-center ga-2">
        <span class="text-subtitle-2 text-primary fox-num">{{ testCase.id }}</span>
        <TestCaseStatusChip :status="testCase.status" size="x-small" />
        <TestCasePriorityChip :priority="testCase.priority" />
        <TestCaseBadges :test-case="testCase" />
        <TestCaseEnvironmentChips :test-case="testCase" />
      </div>
      <div class="text-body-2 text-truncate">{{ testCase.name }}</div>
    </div>
    <slot name="move" />
    <div v-if="!reorderMode" class="d-flex align-center ga-1 flex-shrink-0">
      <TestCaseStatusMenu :status="testCase.status" size="x-small" @change="setStatus(testCase, $event)" />
      <v-btn
        v-if="testCase.reviewNeeded && canEdit"
        icon="tabler:circle-check"
        variant="text"
        size="x-small"
        color="warning"
        :title="`ทบทวน ${testCase.id} แล้ว ไม่ต้องแก้ไข`"
        :aria-label="`ทบทวน ${testCase.id} แล้ว ไม่ต้องแก้ไข`"
        @click="emit('reviewed', testCase)"
      />
      <v-btn icon="tabler:history" variant="text" size="x-small" :aria-label="`ประวัติ ${testCase.id}`" @click="emit('history', testCase)" />
      <v-btn icon="tabler:pencil" variant="text" size="x-small" color="primary" :aria-label="`เปิด ${testCase.id}`" @click="emit('edit', testCase)" />
      <v-btn
        v-if="canArchive"
        icon="tabler:archive"
        variant="text"
        size="x-small"
        :aria-label="`เก็บ ${testCase.id} เข้าคลัง`"
        @click="emit('archive', testCase)"
      />
    </div>
  </div>
</template>

<style scoped>
.tc-sub {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--fox-radius-control);
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@media (max-width: 599.98px) {
  .tc-sub {
    flex-wrap: wrap;
  }
}
</style>
