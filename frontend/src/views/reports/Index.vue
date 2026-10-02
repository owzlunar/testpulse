<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxCardHeader from '@/components/ui/FoxCardHeader.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxDonutChart from '@/components/charts/FoxDonutChart.vue'
import FoxChartLegend from '@/components/charts/FoxChartLegend.vue'
import TestCaseProgress from '@/components/test-cases/TestCaseProgress.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useProjectStore } from '@/stores/project.store'
import type { Tone } from '@/types'
import { formatPercent } from '@/utils/format'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { PRIORITIES, STATUSES, isHighChurn, isOverdue } from '@/domain/test-case'

const projectStore = useProjectStore()
const { currentProject, currentCases: cases, currentStats: stats } = storeToRefs(projectStore)
const { snackbar, notify } = useSnackbar()

const verdict = computed<{ tone: Tone; text: string; icon: string }>(() =>
  stats.value.passRate >= 80
    ? { tone: 'success', text: 'ผ่านเกณฑ์มาตรฐาน QA', icon: 'tabler:circle-check' }
    : stats.value.passRate >= 50
      ? { tone: 'warning', text: 'ยังมีข้อผิดพลาดที่ต้องแก้ไข', icon: 'tabler:alert-triangle' }
      : { tone: 'error', text: 'ความเสี่ยงสูง ยังไม่พร้อมส่งมอบ', icon: 'tabler:alert-circle' },
)

const statusSegments = computed(() =>
  STATUSES.map((s) => ({ label: s.label, value: stats.value.byStatus[s.value], tone: s.tone })).filter((s) => s.value > 0),
)

const pct = (n: number) => (stats.value.total ? (n / stats.value.total) * 100 : 0)

const priorities = computed(() => PRIORITIES.map((p) => ({ ...p, count: cases.value.filter((c) => c.priority === p.value).length })))

const rootCauses = computed(() => {
  const counts = new Map<string, number>()
  cases.value.forEach((c) => c.rootCauseTag && counts.set(c.rootCauseTag, (counts.get(c.rootCauseTag) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
})

const kpis = computed(() => [
  { label: 'เคสหลัก', value: cases.value.filter((c) => !c.parentId).length, icon: 'tabler:flask', tone: 'primary' as Tone },
  { label: 'Sub-cases', value: cases.value.filter((c) => !!c.parentId).length, icon: 'tabler:subtask', tone: 'info' as Tone },
  {
    label: 'ขั้นตอนทดสอบทั้งหมด',
    value: cases.value.reduce((sum, c) => sum + c.steps.length, 0),
    icon: 'tabler:list-numbers',
    tone: 'success' as Tone,
  },
  {
    label: 'เลยกำหนด / แก้ซ้ำ',
    value: `${cases.value.filter(isOverdue).length} / ${cases.value.filter(isHighChurn).length}`,
    icon: 'tabler:alert-triangle',
    tone: 'error' as Tone,
  },
])

const { run } = useAsyncAction()
function exportReport() {
  run(
    () => projectStore.exportMarkdown(),
    (file) => file && notify(`ดาวน์โหลด ${file} แล้ว`),
  )
}
</script>

<template>
  <FoxPageHeader title="รายงานสรุปผลการทดสอบ" :breadcrumbs="[{ title: 'รายงาน' }]">
    <template #actions>
      <v-btn variant="outlined" prepend-icon="tabler:markdown" @click="exportReport">ส่งออก .md</v-btn>
      <v-btn color="primary" prepend-icon="tabler:report-analytics" :to="{ path: '/documents', query: { create: 'test_summary' } }"
        >สร้าง Test Summary Report</v-btn
      >
    </template>
  </FoxPageHeader>

  <div class="fox-stack">
    <v-row class="fox-grid">
      <!-- pass rate -->
      <v-col cols="12" md="5" lg="4">
        <v-card class="fox-card-body h-100">
          <FoxCardHeader title="Overall Pass Rate" :subtitle="currentProject?.name ?? '-'" />
          <v-divider class="my-5" />
          <template v-if="stats.total">
            <FoxDonutChart :segments="statusSegments" :size="220" :thickness="28">
              <span class="text-h2 fox-num">{{ formatPercent(stats.passRate) }}</span>
              <v-chip :color="verdict.tone" size="x-small" variant="tonal" :prepend-icon="verdict.icon" class="mt-1">{{ verdict.text }}</v-chip>
            </FoxDonutChart>
            <FoxChartLegend class="justify-center mt-6" :items="statusSegments" />
          </template>
          <FoxEmptyState v-else icon="tabler:chart-donut" title="ยังไม่มีข้อมูล" text="สร้าง Test Case เพื่อดูสถิติ" />
        </v-card>
      </v-col>

      <!-- status breakdown -->
      <v-col cols="12" md="7" lg="8">
        <v-card class="fox-card-body h-100">
          <FoxCardHeader title="การกระจายตัวของสถานะ" subtitle="ตามวงจร Dev ↔ QA" />
          <TestCaseProgress :stats="stats" :height="12" class="mt-6" />
          <v-table class="mt-4">
            <thead>
              <tr>
                <th>สถานะ</th>
                <th class="text-end">จำนวน</th>
                <th class="text-end">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in STATUSES" :key="s.value">
                <td>
                  <span class="d-inline-flex align-center ga-2">
                    <v-icon :icon="s.icon" :color="s.tone" size="18" />{{ s.label }}
                    <span class="text-caption text-muted">{{ s.hint }}</span>
                  </span>
                </td>
                <td class="text-end fox-num">{{ stats.byStatus[s.value] }}</td>
                <td class="text-end fox-num text-muted">{{ formatPercent(pct(stats.byStatus[s.value])) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="fox-grid">
      <v-col v-for="k in kpis" :key="k.label" cols="12" sm="6" lg="3">
        <FoxStatCard v-bind="k" />
      </v-col>
    </v-row>

    <v-row class="fox-grid">
      <v-col cols="12" md="6">
        <v-card class="fox-card-body h-100">
          <FoxCardHeader title="ระดับความสำคัญ" subtitle="Priority breakdown" />
          <div class="fox-stack mt-6">
            <div v-for="p in priorities" :key="p.value">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="d-inline-flex align-center ga-2 text-subtitle-2"><v-icon :icon="p.icon" :color="p.tone" size="18" />{{ p.label }}</span>
                <span class="text-body-2 fox-num">{{ p.count }} เคส</span>
              </div>
              <v-progress-linear :model-value="pct(p.count)" :color="p.tone" height="8" rounded />
            </div>
          </div>
        </v-card>
      </v-col>

      <v-col cols="12" md="6">
        <v-card class="fox-card-body h-100">
          <FoxCardHeader title="สาเหตุของปัญหา" subtitle="Root cause tagging" />
          <div v-if="rootCauses.length" class="fox-stack mt-6">
            <div v-for="[cause, count] in rootCauses" :key="cause">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="d-inline-flex align-center ga-2 text-subtitle-2"><v-icon icon="tabler:tag" color="caution" size="18" />{{ cause }}</span>
                <span class="text-body-2 fox-num">{{ count }} เคส</span>
              </div>
              <v-progress-linear :model-value="pct(count)" color="caution" height="8" rounded />
            </div>
          </div>
          <FoxEmptyState v-else icon="tabler:tag" title="ยังไม่มีการระบุ Root Cause" text="ระบุสาเหตุได้จากหน้าปฏิทินหรือฟอร์ม Test Case" />
        </v-card>
      </v-col>
    </v-row>
  </div>

  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
