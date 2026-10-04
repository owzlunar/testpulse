<script setup lang="ts">
import { computed } from 'vue'
import { useRunStore } from '@/stores/run.store'
import type { TestCase } from '@/types'
import { currentResultOf, resultOf } from '@/domain/run'

// The case's latest result on each of the project's other environments (e.g. STAGING), next to its
// status (the primary environment's). Runs load with the list (TestCaseList).
const props = defineProps<{ testCase: TestCase }>()
const runStore = useRunStore()

const chips = computed(() =>
  runStore.environmentResults.map((env) => {
    const latest = currentResultOf(props.testCase, env.results)
    const result = resultOf(latest?.status ?? 'untested')
    const outdated = !latest && env.results.has(props.testCase.id)
    return {
      id: env.id,
      text: `${env.name} ${latest ? result.label : outdated ? 'เวอร์ชันเก่า' : 'ยังไม่ทดสอบ'}`,
      tone: latest ? result.tone : 'secondary',
      icon: latest ? result.icon : 'tabler:server',
      title: latest
        ? `${env.name}: ${result.label} ใน ${latest.runName} รอบที่ ${latest.round}${latest.executedBy ? ` โดย ${latest.executedBy}` : ''}`
        : outdated
          ? `${env.name}: ผลล่าสุดทดสอบกับ ${env.results.get(props.testCase.id)!.caseVersion} ต้องทดสอบเวอร์ชันนี้ใหม่`
          : `${env.name}: ยังไม่ได้ทดสอบ`,
    }
  }),
)
</script>

<template>
  <v-chip v-for="c in chips" :key="c.id" :color="c.tone" :prepend-icon="c.icon" :title="c.title" size="x-small" variant="outlined">
    {{ c.text }}
  </v-chip>
</template>
