<script setup lang="ts">
import { computed } from 'vue'
import FoxTimeline from '@/components/ui/FoxTimeline.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { statusOf } from '@/services/test-case.service'
import type { TestCaseVersionRecord, TimelineItem } from '@/types'
import { formatDateTime } from '@/utils/date'

// Version history (newest first): version | status dot | summary, author, reason
const props = defineProps<{ history: TestCaseVersionRecord[] }>()

const records = computed(() => [...props.history].reverse())
const items = computed<TimelineItem[]>(() =>
  records.value.map((r) => ({ time: r.version, text: r.changeSummary, tone: statusOf(r.status).tone })),
)
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
    </template>
  </FoxTimeline>
  <FoxEmptyState v-else icon="tabler:versions" title="ยังไม่มีประวัติเวอร์ชัน" />
</template>
