<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectStats } from '@/types'
import { formatPercent } from '@/utils/format'
import { STATUSES } from '@/domain/test-case'

// Stacked bar: one segment per status, in lifecycle order
const props = withDefaults(defineProps<{ stats: ProjectStats; height?: number; legend?: boolean }>(), {
  height: 8,
  legend: true,
})

const segments = computed(() =>
  STATUSES.map((s) => ({ ...s, count: props.stats.byStatus[s.value] }))
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, pct: (s.count / (props.stats.total || 1)) * 100 })),
)
</script>

<template>
  <div class="tc-progress">
    <div v-if="legend" class="d-flex flex-wrap align-center justify-space-between ga-2 mb-2">
      <div class="d-flex flex-wrap ga-3">
        <span v-for="s in segments" :key="s.value" class="d-inline-flex align-center ga-1 text-caption">
          <span class="tc-progress__dot" :class="`bg-${s.tone}`" />
          <span class="fox-num">{{ s.count }}</span>
          <span class="text-muted">{{ s.label }}</span>
        </span>
        <span v-if="!segments.length" class="text-caption text-muted">ยังไม่มี Test Case</span>
      </div>
      <span class="text-subtitle-2 text-primary fox-num">{{ formatPercent(stats.passRate) }} ผ่าน</span>
    </div>

    <div class="tc-progress__track" :style="{ height: `${height}px` }" role="img" :aria-label="`ผ่าน ${formatPercent(stats.passRate)}`">
      <v-tooltip v-for="s in segments" :key="s.value" :text="`${s.label}: ${s.count} (${formatPercent(s.pct)})`">
        <template #activator="{ props: tip }">
          <div v-bind="tip" class="tc-progress__segment" :class="`bg-${s.tone}`" :style="{ width: `${s.pct}%` }" />
        </template>
      </v-tooltip>
    </div>
  </div>
</template>

<style scoped>
.tc-progress__track {
  display: flex;
  gap: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.tc-progress__segment {
  height: 100%;
  transition: width 0.4s ease;
}

.tc-progress__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
</style>
