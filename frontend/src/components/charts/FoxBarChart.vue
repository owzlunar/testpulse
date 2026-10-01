<script setup lang="ts">
import { computed } from 'vue'
import type { ChartSeries } from '@/types'

// Grouped vertical bar chart (HTML/CSS, so it is fluid at any width).
const props = withDefaults(
  defineProps<{
    labels: string[]
    series: ChartSeries[]
    height?: number
    ticks?: number
    format?: (value: number) => string
  }>(),
  { height: 260, ticks: 4, format: (v: number) => v.toLocaleString('th-TH') },
)

// round the axis max up to a "nice" number (1, 2, 2.5, 5 x 10^n)
const max = computed(() => {
  const raw = Math.max(1, ...props.series.flatMap((s) => s.data))
  const rough = raw / props.ticks
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= rough) ?? 10) * pow
  return step * props.ticks
})

const yTicks = computed(() => Array.from({ length: props.ticks + 1 }, (_, i) => (max.value / props.ticks) * (props.ticks - i)))

const pct = (v: number) => `${(v / max.value) * 100}%`
</script>

<template>
  <div class="fox-bar" :style="{ height: `${height}px` }" role="img" :aria-label="series.map((s) => s.name).join(', ')">
    <div class="fox-bar__axis">
      <span v-for="t in yTicks" :key="t" class="text-caption text-muted fox-num">{{ format(t) }}</span>
    </div>

    <div class="fox-bar__body">
      <div class="fox-bar__plot">
        <div v-for="(t, i) in yTicks" :key="t" class="fox-bar__grid" :style="{ top: `${(i / ticks) * 100}%` }" />
        <div v-for="(label, i) in labels" :key="label" class="fox-bar__group">
          <v-tooltip v-for="s in series" :key="s.name" :text="`${label} · ${s.name}: ${format(s.data[i])}`">
            <template #activator="{ props: tip }">
              <div v-bind="tip" class="fox-bar__bar" :class="`bg-${s.tone}`" :style="{ height: pct(s.data[i]) }" />
            </template>
          </v-tooltip>
        </div>
      </div>
      <div class="fox-bar__labels">
        <span v-for="label in labels" :key="label" class="text-caption text-muted">{{ label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fox-bar {
  display: flex;
  gap: 12px;
}

/* y axis labels line up with the grid lines */
.fox-bar__axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 28px;
  margin-top: -9px;
  margin-bottom: -9px;
}

.fox-bar__body {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.fox-bar__plot {
  position: relative;
  display: flex;
  flex: 1;
  align-items: flex-end;
  justify-content: space-around;
}

.fox-bar__grid {
  position: absolute;
  inset-inline: 0;
  border-top: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
}

.fox-bar__group {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 6px;
  height: 100%;
  flex: 1;
}

.fox-bar__bar {
  width: clamp(5px, 1.2vw, 10px);
  min-height: 2px;
  border-radius: 999px 999px 2px 2px;
  transition:
    height 0.4s ease,
    opacity 0.15s;
}

.fox-bar__bar:hover {
  opacity: 0.8;
}

.fox-bar__labels {
  display: flex;
  justify-content: space-around;
  height: 28px;
  align-items: flex-end;
}

.fox-bar__labels span {
  flex: 1;
  text-align: center;
}
</style>
