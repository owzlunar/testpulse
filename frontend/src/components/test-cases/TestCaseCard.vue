<script setup lang="ts">
import UserAvatar from '@/components/users/UserAvatar.vue'
import TestCaseBadges from './TestCaseBadges.vue'
import TestCasePriorityChip from './TestCasePriorityChip.vue'
import TestCaseStatusChip from './TestCaseStatusChip.vue'
import TestCaseStatusMenu from './TestCaseStatusMenu.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { useRequirementStore } from '@/stores/requirement.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase, TestCaseStatus } from '@/types'
import { formatDateTH } from '@/utils/date'
import { firstName } from '@/utils/format'
import { isDueSoon, isOverdue } from '@/domain/test-case'

// Body of a parent case card in TestCaseList: summary, meta and actions.
// Slots: `grip` (drag handle) and `move` (move buttons), both only in reorder mode.
defineProps<{ testCase: TestCase; reorderMode: boolean }>()
const emit = defineEmits<{
  edit: [tc: TestCase]
  history: [tc: TestCase]
  extend: [tc: TestCase]
  clone: [tc: TestCase]
  'save-template': [tc: TestCase]
  archive: [tc: TestCase]
  reviewed: [tc: TestCase]
  'add-subcase': [parentId: string]
}>()
defineSlots<{ grip?: () => unknown; move?: () => unknown }>()

const store = useTestCaseStore()
const requirementStore = useRequirementStore()
const { run } = useAsyncAction()
const { canCreate, canEdit, canArchive, canHandOff } = useTestCasePermissions()

const setStatus = (tc: TestCase, s: TestCaseStatus) => run(() => store.update(tc.id, { status: s }, tc.projectId))
</script>

<template>
  <div class="fox-card-body">
    <div class="d-flex align-start ga-3">
      <slot name="grip" />
      <div class="flex-grow-1 overflow-hidden">
        <div class="d-flex flex-wrap align-center ga-2 mb-2">
          <v-chip color="primary" size="small" variant="flat" class="fox-num">{{ testCase.id }}</v-chip>
          <span class="text-caption text-muted fox-num">{{ testCase.version }}</span>
          <TestCaseStatusChip :status="testCase.status" />
          <TestCasePriorityChip :priority="testCase.priority" />
          <TestCaseBadges :test-case="testCase" />
          <template v-if="$slots.move">
            <v-spacer />
            <slot name="move" />
          </template>
        </div>
        <h3 class="text-h6 mb-1">{{ testCase.name }}</h3>
        <dl class="tc-spec text-body-2">
          <dt class="text-muted">Requirement</dt>
          <dd class="fox-clamp-2 tc-pre">{{ requirementStore.textFor(testCase) || '-' }}</dd>
          <dt class="text-muted">Scenario</dt>
          <dd class="fox-clamp-2">{{ testCase.testScenario }}</dd>
        </dl>
      </div>
    </div>

    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-4">
      <div class="d-flex flex-wrap align-center ga-4 text-body-2 text-muted">
        <span class="d-inline-flex align-center ga-1"><v-icon icon="tabler:list-check" size="16" />{{ testCase.steps.length }} ขั้นตอน</span>
        <span v-if="testCase.expectedImages.length + testCase.actualImages.length" class="d-inline-flex align-center ga-1">
          <v-icon icon="tabler:photo" size="16" />{{ testCase.expectedImages.length + testCase.actualImages.length }} ภาพ
        </span>
        <span class="d-inline-flex align-center ga-1" :class="{ 'text-error': isOverdue(testCase), 'text-warning': isDueSoon(testCase) }">
          <v-icon icon="tabler:calendar-due" size="16" />{{ formatDateTH(testCase.expiryDate) }}
        </span>
        <span v-if="testCase.assignedDev" class="d-inline-flex align-center ga-1">
          <v-icon icon="tabler:code" size="16" />{{ firstName(testCase.assignedDev) }}
        </span>
        <span v-if="testCase.activeUser" class="d-inline-flex align-center ga-2">
          <span class="tc-presence" />
          <UserAvatar :user="testCase.activeUser" size="20" />
          {{ firstName(testCase.activeUser.name) }} {{ testCase.activeUser.action === 'editing' ? 'แก้ไขล่าสุด' : 'กำลังดู' }}
        </span>
      </div>

      <!-- card actions are hidden while reordering -->
      <div v-if="!reorderMode" class="d-flex flex-wrap align-center ga-2">
        <v-btn
          v-if="testCase.status === 'pending' && canHandOff"
          color="info"
          size="small"
          prepend-icon="tabler:send"
          @click="setStatus(testCase, 'ready_for_test')"
        >
          ส่งมอบพร้อมเทส
        </v-btn>
        <TestCaseStatusMenu :status="testCase.status" @change="setStatus(testCase, $event)" />
        <v-btn v-if="canCreate" variant="tonal" size="small" prepend-icon="tabler:subtask" @click="emit('add-subcase', testCase.id)">Sub-case</v-btn>
        <v-btn icon="tabler:pencil" variant="text" size="small" color="primary" :aria-label="`เปิด ${testCase.id}`" @click="emit('edit', testCase)" />
        <v-menu location="bottom end">
          <template #activator="{ props: menu }">
            <v-btn v-bind="menu" icon="tabler:dots-vertical" variant="text" size="small" :aria-label="`ตัวเลือก ${testCase.id}`" />
          </template>
          <v-list>
            <v-list-item
              v-if="testCase.reviewNeeded && canEdit"
              prepend-icon="tabler:circle-check"
              title="ทบทวนแล้ว ไม่ต้องแก้ไข"
              base-color="warning"
              @click="emit('reviewed', testCase)"
            />
            <v-list-item prepend-icon="tabler:history" title="ประวัติและ Audit" @click="emit('history', testCase)" />
            <v-list-item prepend-icon="tabler:calendar-time" title="ขอขยายเวลา" @click="emit('extend', testCase)" />
            <template v-if="canCreate">
              <v-list-item prepend-icon="tabler:copy" title="ทำสำเนา (Clone)" @click="emit('clone', testCase)" />
              <v-list-item prepend-icon="tabler:template" title="บันทึกเป็น Template" @click="emit('save-template', testCase)" />
            </template>
            <template v-if="canArchive">
              <v-divider class="my-1" />
              <v-list-item prepend-icon="tabler:archive" title="เก็บเข้าคลัง" @click="emit('archive', testCase)" />
            </template>
          </v-list>
        </v-menu>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tc-spec {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  margin: 0;
}

.tc-spec dd {
  margin: 0;
}

.tc-pre {
  white-space: pre-line;
}

.tc-presence {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 3px rgba(var(--v-theme-success), 0.2);
}

@media (max-width: 599.98px) {
  .tc-spec {
    grid-template-columns: 1fr;
  }
}
</style>
