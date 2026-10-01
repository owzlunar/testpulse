<script setup lang="ts">
import { computed, ref } from 'vue'
import FoxTimeline from '@/components/ui/FoxTimeline.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import TestCaseVersionDialog from './TestCaseVersionDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { statusOf } from '@/services/test-case.service'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase, TestCaseVersionRecord, TimelineItem } from '@/types'
import { formatDateTime } from '@/utils/date'

// Version history (newest first): version | status dot | summary, author, reason.
// With `testCase`, each saved version can be compared with the current one (and restored when `canRestore`).
const props = withDefaults(
  defineProps<{
    history: TestCaseVersionRecord[]
    testCase?: TestCase | null
    /** offer "restore"; leave off inside an open edit form, whose copy would overwrite the restore */
    canRestore?: boolean
  }>(),
  { testCase: null, canRestore: false },
)
const emit = defineEmits<{ restored: [version: string] }>()

const records = computed(() => [...props.history].reverse())
const items = computed<TimelineItem[]>(() =>
  records.value.map((r) => ({ time: r.version, text: r.changeSummary, tone: statusOf(r.status).tone })),
)

const store = useTestCaseStore()
const { busy, run } = useAsyncAction()
const viewing = ref<TestCaseVersionRecord | null>(null)
const viewOpen = ref(false)

function view(record: TestCaseVersionRecord) {
  viewing.value = record
  viewOpen.value = true
}

function restore(version: string) {
  const tc = props.testCase
  if (!tc) return
  run(() => store.restoreVersion(tc.id, tc.projectId, version), () => {
    viewOpen.value = false
    emit('restored', version)
  })
}
</script>

<template>
  <FoxTimeline v-if="items.length" :items="items">
    <template #item="{ index }">
      <div class="text-body-2 text-high-emphasis">{{ records[index].changeSummary }}</div>
      <div class="text-caption text-muted">
        <span :class="`text-${statusOf(records[index].status).tone}`">{{ statusOf(records[index].status).label }}</span>
        · {{ records[index].updatedBy }} · {{ formatDateTime(records[index].timestamp) }}
      </div>
      <div v-if="records[index].reason" class="text-caption mt-1">เหตุผล: {{ records[index].reason }}</div>
      <v-btn
        v-if="testCase && records[index].snapshot"
        variant="text"
        color="primary"
        size="x-small"
        prepend-icon="tabler:git-compare"
        class="mt-1 px-1"
        @click="view(records[index])"
      >
        {{ records[index].version === testCase.version ? 'ดูเนื้อหา' : 'เทียบกับปัจจุบัน' }}
      </v-btn>
    </template>
  </FoxTimeline>
  <FoxEmptyState v-else icon="tabler:versions" title="ยังไม่มีประวัติเวอร์ชัน" />

  <TestCaseVersionDialog
    v-if="testCase"
    v-model="viewOpen"
    :test-case="testCase"
    :record="viewing"
    :can-restore="canRestore"
    :loading="busy"
    @restore="restore"
  />
</template>
