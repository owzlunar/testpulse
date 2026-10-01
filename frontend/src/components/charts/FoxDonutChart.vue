<script setup lang="ts">
import { computed } from 'vue'
import type { ChartSegment } from '@/types'

// Donut chart. Center content via default slot.
const props = withDefaults(
  defineProps<{
    segments: ChartSegment[]
    size?: number
    thickness?: number
  }>(),
  { size: 200, thickness: 24 },
)

const r = computed(() => (props.size - props.thickness) / 2)
const c = computed(() => 2 * Math.PI * r.value)
const total = computed(() => props.segments.reduce((sum, s) => sum + s.value, 0) || 1)

const arcs = computed(() => {
  let offset = 0
  return props.segments.map((s) => {
    const len = (s.value / total.value) * c.value
    const arc = { ...s, dash: `${Math.max(len - 2, 0)} ${c.value}`, offset: -offset }
    offset += len
    return arc
  })
})
</script>

<template>
  <div class="fox-donut" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" role="img" :aria-label="segments.map((s) => `${s.label} ${s.value}`).join(', ')">
      <g :transform="`rotate(-90 ${size / 2} ${size / 2})`" fill="none" :stroke-width="thickness">
        <circle class="fox-donut__track" :cx="size / 2" :cy="size / 2" :r="r" stroke="currentColor" />
        <circle
          v-for="a in arcs"
          :key="a.label"
          :class="`text-${a.tone}`"
          :cx="size / 2"
          :cy="size / 2"
          :r="r"
          stroke="currentColor"
          :stroke-dasharray="a.dash"
          :stroke-dashoffset="a.offset"
        >
          <title>{{ a.label }}: {{ a.value.toLocaleString('th-TH') }}</title>
        </circle>
      </g>
    </svg>
    <div class="fox-donut__center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.fox-donut {
  position: relative;
  max-width: 100%;
  margin-inline: auto;
}

.fox-donut svg {
  width: 100%;
  height: 100%;
}

.fox-donut__track {
  color: rgba(var(--v-theme-on-surface), 0.06);
}

.fox-donut__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
</style>
