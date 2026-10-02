<script setup lang="ts">
import { computed } from 'vue'
import type { TestRun } from '@/types'
import { formatPercent } from '@/utils/format'
import { RESULT_STATUSES, runCounts } from '@/domain/run'

// Stacked bar of the run's results (Pass / Fail / Blocked / Skip / not yet run)
const props = withDefaults(defineProps<{ run: TestRun; height?: number; legend?: boolean }>(), { height: 8, legend: true })

const counts = computed(() => runCounts(props.run))
const segments = computed(() =>
  RESULT_STATUSES.map((s) => ({ ...s, count: counts.value[s.value] }))
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, pct: (s.count / (counts.value.total || 1)) * 100 })),
)
</script>

<template>
  <div>
    <div v-if="legend" class="d-flex flex-wrap align-center justify-space-between ga-2 mb-2">
      <div class="d-flex flex-wrap ga-3">
        <span v-for="s in segments" :key="s.value" class="d-inline-flex align-center ga-1 text-caption">
          <span class="run-progress__dot" :class="s.value === 'untested' ? 'run-progress__dot--empty' : `bg-${s.tone}`" />
          <span class="fox-num">{{ s.count }}</span
          ><span class="text-muted">{{ s.label }}</span>
        </span>
      </div>
      <span class="text-caption text-muted fox-num"
        >ทดสอบแล้ว {{ counts.executed }}/{{ counts.total }} · ผ่าน {{ formatPercent(counts.passRate, 0) }}</span
      >
    </div>
    <div class="run-progress__track" :style="{ height: `${height}px` }">
      <div
        v-for="s in segments.filter((x) => x.value !== 'untested')"
        :key="s.value"
        class="run-progress__seg"
        :class="`bg-${s.tone}`"
        :style="{ width: `${s.pct}%` }"
        :title="`${s.label}: ${s.count}`"
      />
    </div>
  </div>
</template>

<style scoped>
.run-progress__track {
  display: flex;
  gap: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.run-progress__seg {
  height: 100%;
  transition: width 0.4s ease;
}

.run-progress__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.run-progress__dot--empty {
  border: 1.5px solid rgb(var(--v-theme-muted));
}
</style>
