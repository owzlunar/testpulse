<script setup lang="ts">
import TestCaseAuditList from './TestCaseAuditList.vue'
import TestCaseStatusChip from './TestCaseStatusChip.vue'
import TestCaseVersionTimeline from './TestCaseVersionTimeline.vue'
import { computed } from 'vue'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase } from '@/types'

const open = defineModel<boolean>({ default: false })
const props = defineProps<{ testCase: TestCase | null }>()
const emit = defineEmits<{ restored: [label: string] }>()

const store = useTestCaseStore()
const { canEdit } = useTestCasePermissions()
// follow the stored case, so a restore shows up here at once
const live = computed(() => (props.testCase ? store.getById(props.testCase.id, props.testCase.projectId) ?? props.testCase : null))
</script>

<template>
  <v-dialog v-model="open" max-width="760">
    <v-card v-if="live">
      <div class="d-flex align-start justify-space-between fox-card-body pb-0">
        <div class="overflow-hidden">
          <div class="d-flex flex-wrap align-center ga-2 mb-1">
            <h2 class="text-h5 fox-num">{{ live.id }}</h2>
            <v-chip size="small" color="primary" variant="tonal" class="fox-num">{{ live.version }}</v-chip>
            <TestCaseStatusChip :status="live.status" />
          </div>
          <p class="text-body-2 text-muted">{{ live.name }}</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <v-card-text class="fox-card-body">
        <v-row class="fox-grid">
          <v-col cols="12" md="6">
            <div class="text-overline text-muted mb-3">ประวัติเวอร์ชัน</div>
            <TestCaseVersionTimeline
              :history="live.versionHistory ?? []"
              :test-case="live"
              :can-restore="canEdit && !live.archivedAt"
              @restored="emit('restored', `${live.id}: กู้คืนเนื้อหาจาก ${$event} เป็น ${live.version}`)"
            />
          </v-col>
          <v-col cols="12" md="6">
            <div class="text-overline text-muted mb-3">Audit Trail</div>
            <TestCaseAuditList :case-id="live.id" :project-id="live.projectId" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
