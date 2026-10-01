<script setup lang="ts">
import { computed } from 'vue'
import type { Tone } from '@/types'

// KPI widget: icon + value + label + optional change percentage
const props = withDefaults(
  defineProps<{
    icon: string
    value: string | number
    label: string
    tone?: Tone
    /** e.g. 12 or -9 -> shown as +12% / -9% */
    delta?: number | null
  }>(),
  { tone: 'primary', delta: null },
)

const deltaTone = computed(() => ((props.delta ?? 0) >= 0 ? 'success' : 'error'))
</script>

<template>
  <v-card class="fox-card-body h-100">
    <div class="d-flex align-center ga-4">
      <v-avatar :color="tone" size="52">
        <v-icon :icon="icon" size="24" />
      </v-avatar>
      <div class="flex-grow-1 overflow-hidden">
        <div class="d-flex align-center flex-wrap ga-2">
          <span class="text-h4 fox-num">{{ value }}</span>
          <v-chip v-if="delta !== null" :color="deltaTone" size="x-small" variant="tonal" class="fox-num">
            <v-icon :icon="delta >= 0 ? 'tabler:arrow-up-right' : 'tabler:arrow-down-right'" start size="12" />
            {{ Math.abs(delta) }}%
          </v-chip>
        </div>
        <div class="text-body-2 text-muted text-truncate">{{ label }}</div>
      </div>
    </div>
  </v-card>
</template>
