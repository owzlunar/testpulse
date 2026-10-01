<script setup lang="ts">
import { computed } from 'vue'
import { requirementText } from '@/services/requirement.service'
import { SPEC_FIELD_LABELS, specDiff } from '@/services/test-case.service'
import { useRequirementStore } from '@/stores/requirement.store'
import type { TestCase, TestCaseSpec, TestCaseVersionRecord, TestStep } from '@/types'
import { formatDateTime } from '@/utils/date'

// One version's spec compared with the current case; optionally restores it (the host runs the restore)
const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    testCase: TestCase
    record: TestCaseVersionRecord | null
    canRestore?: boolean
    loading?: boolean
  }>(),
  { canRestore: false, loading: false },
)
const emit = defineEmits<{ restore: [version: string] }>()

const requirementStore = useRequirementStore()
const snapshot = computed(() => props.record?.snapshot ?? null)
const isCurrent = computed(() => props.record?.version === props.testCase.version)
const changed = computed(() =>
  snapshot.value ? specDiff(snapshot.value, props.testCase, props.testCase.projectId, requirementStore.requirements) : [],
)
const same = computed(() => SPEC_FIELD_LABELS.filter((l) => !changed.value.includes(l.field)).map((l) => l.label))
const rows = computed(() => SPEC_FIELD_LABELS.filter((l) => changed.value.includes(l.field)))

/** a spec field as text; requirements resolve their links like the rest of the app */
function textOf(spec: TestCaseSpec, field: keyof TestCaseSpec): string {
  if (field === 'requirement') return requirementText({ ...props.testCase, ...spec }, requirementStore.requirements) || '-'
  const value = spec[field]
  return typeof value === 'string' ? value || '-' : ''
}

const stepText = (s: TestStep, i: number) =>
  [`${i + 1}. ${s.action}`, s.testData && `Test data: ${s.testData}`, s.expectedResult && `คาดหวัง: ${s.expectedResult}`].filter(Boolean).join('\n')
</script>

<template>
  <v-dialog v-model="open" max-width="880" scrollable>
    <v-card v-if="record">
      <div class="d-flex align-start justify-space-between fox-card-body pb-2">
        <div class="overflow-hidden">
          <div class="d-flex flex-wrap align-center ga-2 mb-1">
            <h2 class="text-h5 fox-num">{{ testCase.id }} · {{ record.version }}</h2>
            <v-chip v-if="isCurrent" size="small" color="primary" variant="tonal">เวอร์ชันปัจจุบัน</v-chip>
          </div>
          <p class="text-body-2 text-muted">{{ record.changeSummary }} · {{ record.updatedBy }} · {{ formatDateTime(record.timestamp) }}</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-divider />

      <v-card-text class="fox-card-body">
        <v-alert v-if="!snapshot" type="info" variant="tonal" density="compact">
          เวอร์ชันนี้บันทึกก่อนระบบเริ่มเก็บเนื้อหาของแต่ละเวอร์ชัน จึงดูหรือกู้คืนไม่ได้
        </v-alert>
        <template v-else>
          <p v-if="!changed.length" class="text-body-2 text-muted">เนื้อหาเหมือนเวอร์ชันปัจจุบัน ({{ testCase.version }}) ทุกช่อง</p>
          <div v-else class="version-grid text-body-2">
            <div class="text-overline text-muted">ช่อง</div>
            <div class="text-overline text-muted">{{ record.version }}</div>
            <div class="text-overline text-muted">ปัจจุบัน ({{ testCase.version }})</div>
            <template v-for="row in rows" :key="row.field">
              <div class="text-subtitle-2">{{ row.label }}</div>
              <template v-if="row.field === 'steps'">
                <div class="version-cell version-cell--old">
                  <div v-for="(s, i) in snapshot.steps" :key="s.id" class="version-pre mb-2">{{ stepText(s, i) }}</div>
                </div>
                <div class="version-cell version-cell--new">
                  <div v-for="(s, i) in testCase.steps" :key="s.id" class="version-pre mb-2">{{ stepText(s, i) }}</div>
                </div>
              </template>
              <template v-else>
                <div class="version-cell version-cell--old version-pre">{{ textOf(snapshot, row.field) }}</div>
                <div class="version-cell version-cell--new version-pre">{{ textOf(testCase, row.field) }}</div>
              </template>
            </template>
          </div>
          <p v-if="changed.length && same.length" class="text-caption text-muted mt-4">เหมือนปัจจุบัน: {{ same.join(', ') }}</p>
          <p class="text-caption text-muted mt-1">ภาพอ้างอิงไม่ถูกเก็บในประวัติเวอร์ชัน การกู้คืนจะคงภาพปัจจุบันไว้</p>
        </template>
      </v-card-text>

      <template v-if="canRestore && snapshot && changed.length && !isCurrent">
        <v-divider />
        <div class="d-flex flex-wrap align-center ga-3 fox-card-body py-4">
          <span class="text-body-2 text-muted">
            กู้คืนเป็นเวอร์ชันใหม่ต่อจาก {{ testCase.version }}<template v-if="testCase.status === 'passed'"> และเคสต้องทดสอบใหม่</template>
          </span>
          <v-spacer />
          <v-btn variant="outlined" @click="open = false">ปิด</v-btn>
          <v-btn color="primary" prepend-icon="tabler:restore" :loading="loading" @click="emit('restore', record.version)"
            >กู้คืน {{ record.version }}</v-btn
          >
        </div>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.version-grid {
  display: grid;
  grid-template-columns: 140px 1fr 1fr;
  gap: 8px 16px;
  align-items: start;
}

.version-cell {
  padding: 8px 12px;
  border-radius: var(--fox-radius-control);
}

.version-cell--old {
  background: rgba(var(--v-theme-error), 0.06);
}

.version-cell--new {
  background: rgba(var(--v-theme-success), 0.06);
}

.version-pre {
  white-space: pre-line;
  word-break: break-word;
}

@media (max-width: 599.98px) {
  .version-grid {
    grid-template-columns: 1fr;
  }
}
</style>
