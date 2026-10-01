<script setup lang="ts">
import TestCaseAuditList from './TestCaseAuditList.vue'
import TestCaseStatusChip from './TestCaseStatusChip.vue'
import TestCaseVersionTimeline from './TestCaseVersionTimeline.vue'
import type { TestCase } from '@/types'

const open = defineModel<boolean>({ default: false })
defineProps<{ testCase: TestCase | null }>()
</script>

<template>
  <v-dialog v-model="open" max-width="760">
    <v-card v-if="testCase">
      <div class="d-flex align-start justify-space-between fox-card-body pb-0">
        <div class="overflow-hidden">
          <div class="d-flex flex-wrap align-center ga-2 mb-1">
            <h2 class="text-h5 fox-num">{{ testCase.id }}</h2>
            <v-chip size="small" color="primary" variant="tonal" class="fox-num">{{ testCase.version }}</v-chip>
            <TestCaseStatusChip :status="testCase.status" />
          </div>
          <p class="text-body-2 text-muted">{{ testCase.name }}</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <v-card-text class="fox-card-body">
        <v-row class="fox-grid">
          <v-col cols="12" md="6">
            <div class="text-overline text-muted mb-3">ประวัติเวอร์ชัน</div>
            <TestCaseVersionTimeline :history="testCase.versionHistory ?? []" />
          </v-col>
          <v-col cols="12" md="6">
            <div class="text-overline text-muted mb-3">Audit Trail</div>
            <TestCaseAuditList :case-id="testCase.id" :project-id="testCase.projectId" />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
