<script setup lang="ts">
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxCardHeader from '@/components/ui/FoxCardHeader.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxDonutChart from '@/components/charts/FoxDonutChart.vue'
import FoxChartLegend from '@/components/charts/FoxChartLegend.vue'
import TestCaseProgress from '@/components/test-cases/TestCaseProgress.vue'
import { useSnackbar } from '@/composables/useSnackbar'
import { useProjectStore } from '@/stores/project.store'
import { useReportStore } from '@/stores/report.store'
import type { Tone } from '@/types'
import { formatPercent } from '@/utils/format'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { DEFECT_CAUSES, SEVERITIES } from '@/domain/defect'
import { runStatusOf } from '@/domain/run'
import { PRIORITIES, STATUSES } from '@/domain/test-case'

const projectStore = useProjectStore()
const { currentProject } = storeToRefs(projectStore)
const reportStore = useReportStore()
const { snackbar, notify } = useSnackbar()
const { run } = useAsyncAction()

// computed by the server for the selected project, fetched on every visit
watch(
  () => currentProject.value?.id,
  (id) => id && run(() => reportStore.load(id)),
  { immediate: true },
)
const report = computed(() => (reportStore.report?.projectId === currentProject.value?.id ? reportStore.report : null))
const stats = computed(() => report.value!.stats)

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

const priorities = computed(() => PRIORITIES.map((p) => ({ ...p, count: report.value!.byPriority[p.value] })))

const severities = computed(() => SEVERITIES.map((s) => ({ ...s, count: report.value!.defects.openBySeverity[s.value] })))

const causes = computed(() => DEFECT_CAUSES.map((c) => ({ ...c, ...report.value!.defects.byCause[c.value] })))
const hours = (h: number | null) => (h === null ? '-' : h < 48 ? `${h} ชม.` : `${Math.round((h / 24) * 10) / 10} วัน`)

const kpis = computed(() => {
  const r = report.value!
  return [
    { label: 'เคสหลัก', value: r.mainCases, icon: 'tabler:flask', tone: 'primary' as Tone },
    { label: 'Sub-cases', value: r.subCases, icon: 'tabler:subtask', tone: 'info' as Tone },
    { label: 'ขั้นตอนทดสอบทั้งหมด', value: r.steps, icon: 'tabler:list-numbers', tone: 'success' as Tone },
    { label: 'เลยกำหนด / แก้ซ้ำ', value: `${r.overdue} / ${r.highChurn}`, icon: 'tabler:alert-triangle', tone: 'error' as Tone },
  ]
})

function exportReport() {
  run(
    () => projectStore.exportMarkdown(),
    (file) => file && notify(`ดาวน์โหลด ${file} แล้ว`),
  )
}
</script>

<template>
  <FoxPageHeader :breadcrumbs="[{ title: 'รายงาน' }]">
    <template #actions>
      <v-btn variant="outlined" prepend-icon="tabler:markdown" @click="exportReport">ส่งออก .md</v-btn>
      <v-btn color="primary" prepend-icon="tabler:report-analytics" :to="{ path: '/documents', query: { create: 'test_summary' } }"
        >สร้าง Test Summary Report</v-btn
      >
    </template>
  </FoxPageHeader>

  <FoxPageSkeleton v-if="!report" :stats="4" :rows="2" />
  <div v-else class="fox-stack">
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

    <v-row v-if="report.environments.length > 1" class="fox-grid">
      <!-- results by environment -->
      <v-col cols="12" md="7">
        <v-card class="fox-card-body h-100 report-environments">
          <FoxCardHeader title="ผลตาม Environment" subtitle="Environment หลักคือสถานะของ Test Case · อื่นๆ คือผลล่าสุดบน Environment นั้น" />
          <v-table class="mt-4">
            <thead>
              <tr>
                <th>Environment</th>
                <th class="text-end">Pass</th>
                <th class="text-end">Fail</th>
                <th class="text-end">Blocked</th>
                <th class="text-end">ยังไม่ทดสอบ</th>
                <th class="text-end">Pass rate</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in report.environments" :key="e.id">
                <td>
                  <span class="d-inline-flex align-center ga-2"
                    ><v-icon icon="tabler:server" size="18" color="primary" />{{ e.name }}
                    <v-chip v-if="e.primary" size="x-small" color="primary" variant="tonal">หลัก</v-chip></span
                  >
                </td>
                <td class="text-end fox-num">{{ e.passed }}</td>
                <td class="text-end fox-num">{{ e.failed }}</td>
                <td class="text-end fox-num">{{ e.blocked }}</td>
                <td class="text-end fox-num text-muted">{{ e.notRun }}</td>
                <td class="text-end fox-num">{{ formatPercent(e.passRate) }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <!-- code vs server problems -->
      <v-col cols="12" md="5">
        <v-card class="fox-card-body h-100 report-causes">
          <FoxCardHeader title="สาเหตุของ Defect" subtitle="โค้ด หรือ Server / Environment · เวลาเฉลี่ยจนแก้ไขเสร็จ" />
          <div class="fox-stack mt-6">
            <div v-for="c in causes" :key="c.value">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="d-inline-flex align-center ga-2 text-subtitle-2"><v-icon :icon="c.icon" :color="c.tone" size="18" />{{ c.label }}</span>
                <span class="text-body-2 fox-num">เปิดอยู่ {{ c.open }} / {{ c.total }}</span>
              </div>
              <div class="text-caption text-muted fox-num">แก้ไขเฉลี่ย {{ hours(c.avgFixHours) }}</div>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="fox-grid">
      <v-col v-for="k in kpis" :key="k.label" cols="12" sm="6" lg="3">
        <FoxStatCard v-bind="k" />
      </v-col>
    </v-row>

    <v-row class="fox-grid">
      <!-- latest run -->
      <v-col cols="12" md="6">
        <v-card class="fox-card-body h-100 report-runs">
          <FoxCardHeader title="รอบการทดสอบ" :subtitle="`ทั้งหมด ${report.runs.total} รอบ · กำลังดำเนินการ ${report.runs.open} รอบ`" />
          <template v-if="report.runs.latest">
            <div class="d-flex align-center justify-space-between mt-6 mb-2">
              <span class="text-subtitle-2">{{ report.runs.latest.name }} รอบที่ {{ report.runs.latest.round }}</span>
              <v-chip :color="runStatusOf(report.runs.latest.status).tone" size="small" variant="tonal">{{
                runStatusOf(report.runs.latest.status).label
              }}</v-chip>
            </div>
            <v-progress-linear :model-value="report.runs.latest.passRate" color="success" height="8" rounded />
            <div class="d-flex justify-space-between text-body-2 text-muted mt-2">
              <span class="fox-num">ทดสอบแล้ว {{ report.runs.latest.executed }}/{{ report.runs.latest.total }} เคส</span>
              <span class="fox-num">Pass {{ formatPercent(report.runs.latest.passRate) }}</span>
            </div>
          </template>
          <FoxEmptyState v-else icon="tabler:player-play" title="ยังไม่มีรอบการทดสอบ" text="สร้างรอบการทดสอบเพื่อติดตามผล" />
        </v-card>
      </v-col>

      <!-- open defects -->
      <v-col cols="12" md="6">
        <v-card class="fox-card-body h-100 report-defects">
          <FoxCardHeader title="Defect ที่ยังเปิดอยู่" :subtitle="`${report.defects.open} จาก ${report.defects.total} รายการ`" />
          <div v-if="report.defects.open" class="fox-stack mt-6">
            <div v-for="sv in severities" :key="sv.value">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="d-inline-flex align-center ga-2 text-subtitle-2"
                  ><v-icon :icon="sv.icon" :color="sv.tone" size="18" />{{ sv.label }}</span
                >
                <span class="text-body-2 fox-num">{{ sv.count }} รายการ</span>
              </div>
              <v-progress-linear :model-value="(sv.count / report.defects.open) * 100" :color="sv.tone" height="8" rounded />
            </div>
          </div>
          <FoxEmptyState v-else icon="tabler:bug-off" title="ไม่มี Defect ค้าง" text="Defect ทั้งหมดถูกปิดหรือปฏิเสธแล้ว" />
        </v-card>
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
          <div v-if="report.rootCauses.length" class="fox-stack mt-6">
            <div v-for="c in report.rootCauses" :key="c.tag">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="d-inline-flex align-center ga-2 text-subtitle-2"><v-icon icon="tabler:tag" color="caution" size="18" />{{ c.tag }}</span>
                <span class="text-body-2 fox-num">{{ c.count }} เคส</span>
              </div>
              <v-progress-linear :model-value="pct(c.count)" color="caution" height="8" rounded />
            </div>
          </div>
          <FoxEmptyState v-else icon="tabler:tag" title="ยังไม่มีการระบุ Root Cause" text="ระบุสาเหตุได้จากหน้าปฏิทินหรือฟอร์ม Test Case" />
        </v-card>
      </v-col>
    </v-row>
  </div>

  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
