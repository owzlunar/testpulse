<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import RunProgress from '@/components/test-runs/RunProgress.vue'
import TestRunDialog from '@/components/test-runs/TestRunDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { RUN_STATUSES, runCounts, runStatusOf, runTypeOf } from '@/services/run.service'
import { useRunStore } from '@/stores/run.store'
import type { RunStatus, TestRun, TestRunInput, Tone } from '@/types'
import { formatDateTH } from '@/utils/date'

const router = useRouter()
const store = useRunStore()
const { current, loaded } = storeToRefs(store)
const { canExecute } = useTestCasePermissions()
const { snackbar, notify } = useSnackbar()
const { busy: saving, run } = useAsyncAction()

onMounted(() => run(() => store.ensureLoaded()))

const status = ref<RunStatus | null>(null)
const filtered = computed(() => current.value.filter((r) => !status.value || r.status === status.value))

const stats = computed(() => {
  const active = current.value.filter((r) => r.status === 'in_progress')
  const pending = active.reduce((n, r) => n + runCounts(r).untested, 0)
  const last = current.value.find((r) => r.status === 'completed')
  return [
    { label: 'รอบที่กำลังทดสอบ', value: active.length, icon: 'tabler:player-play', tone: 'warning' as Tone },
    { label: 'เคสที่รอทดสอบในรอบที่เปิดอยู่', value: pending, icon: 'tabler:hourglass', tone: 'info' as Tone },
    { label: last ? `Pass rate รอบล่าสุด (${last.name} #${last.round})` : 'ยังไม่มีรอบที่ปิดแล้ว', value: last ? `${runCounts(last).passRate.toFixed(0)}%` : '-', icon: 'tabler:chart-pie', tone: 'success' as Tone },
    { label: 'รอบทั้งหมด', value: current.value.length, icon: 'tabler:list-check', tone: 'primary' as Tone },
  ]
})

const dialog = ref(false)
function onSave(input: TestRunInput) {
  run(() => store.create(input), (created) => {
    dialog.value = false
    notify(`สร้าง ${created.name} รอบที่ ${created.round} แล้ว`)
    router.push(`/test-runs/${created.id}`)
  })
}

const confirmOpen = ref(false)
const deleting = ref<TestRun | null>(null)
function askDelete(r: TestRun) {
  deleting.value = r
  confirmOpen.value = true
}
function onDelete() {
  const r = deleting.value
  if (r) run(() => store.remove(r.id), () => notify(`ลบ ${r.name} รอบที่ ${r.round} แล้ว`))
}
</script>

<template>
  <FoxPageHeader title="รอบการทดสอบ" :breadcrumbs="[{ title: 'Test Runs' }]">
    <template #actions>
      <v-btn v-if="canExecute" color="primary" prepend-icon="tabler:plus" @click="dialog = true">สร้างรอบการทดสอบ</v-btn>
    </template>
  </FoxPageHeader>

  <FoxPageSkeleton v-if="!loaded" />
  <div v-else class="fox-stack">
    <v-row class="fox-grid">
      <v-col v-for="s in stats" :key="s.icon" cols="12" sm="6" lg="3">
        <FoxStatCard v-bind="s" />
      </v-col>
    </v-row>

    <v-card class="fox-card-body">
      <v-chip-group v-model="status" aria-label="กรองสถานะ">
        <v-chip v-for="s in RUN_STATUSES" :key="s.value" :value="s.value" :color="s.tone" :prepend-icon="s.icon" variant="tonal" filter>
          {{ s.label }} <span class="fox-num ml-1">{{ current.filter((r) => r.status === s.value).length }}</span>
        </v-chip>
      </v-chip-group>
    </v-card>

    <v-card v-for="r in filtered" :key="r.id" class="fox-card-body run-card" @click="router.push(`/test-runs/${r.id}`)">
      <div class="d-flex flex-wrap align-start justify-space-between ga-3 mb-4">
        <div class="overflow-hidden">
          <div class="d-flex flex-wrap align-center ga-2 mb-1">
            <v-chip :color="runTypeOf(r.type).tone" :prepend-icon="runTypeOf(r.type).icon" size="small" variant="tonal">{{ runTypeOf(r.type).label }}</v-chip>
            <v-chip :color="runStatusOf(r.status).tone" :prepend-icon="runStatusOf(r.status).icon" size="small" variant="flat">{{ runStatusOf(r.status).label }}</v-chip>
          </div>
          <h3 class="text-h5">{{ r.name }} <span class="text-muted">· รอบที่ {{ r.round }}</span></h3>
          <div class="d-flex flex-wrap ga-4 text-body-2 text-muted mt-1">
            <span class="d-inline-flex align-center ga-1"><v-icon icon="tabler:server" size="16" />{{ r.environment }}<template v-if="r.build"> · {{ r.build }}</template></span>
            <span class="d-inline-flex align-center ga-1"><v-icon icon="tabler:calendar" size="16" />{{ formatDateTH(r.plannedStart) }} – {{ formatDateTH(r.plannedEnd) }}</span>
            <span class="d-inline-flex align-center ga-1"><v-icon icon="tabler:user" size="16" />{{ r.createdBy }}</span>
          </div>
        </div>
        <div class="d-flex ga-2" @click.stop>
          <v-btn v-if="r.status !== 'completed' && canExecute" color="primary" prepend-icon="tabler:player-play" :to="`/test-runs/${r.id}`">
            {{ r.status === 'planned' ? 'เริ่มทดสอบ' : 'ทดสอบต่อ' }}
          </v-btn>
          <v-btn v-else variant="outlined" prepend-icon="tabler:eye" :to="`/test-runs/${r.id}`">ดูผล</v-btn>
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn v-bind="props" icon="tabler:dots-vertical" variant="text" :aria-label="`ตัวเลือก ${r.name}`" />
            </template>
            <v-list>
              <v-list-item prepend-icon="tabler:file-description" title="สร้างรายงานผลรอบนี้" :to="{ path: '/documents', query: { create: 'test_summary', runId: r.id } }" />
              <v-list-item v-if="r.type === 'uat'" prepend-icon="tabler:certificate" title="สร้างเอกสาร UAT Sign-off" :to="{ path: '/documents', query: { create: 'uat', runId: r.id } }" />
              <v-divider class="my-1" />
              <v-list-item prepend-icon="tabler:trash" title="ลบรอบนี้" base-color="error" @click="askDelete(r)" />
            </v-list>
          </v-menu>
        </div>
      </div>
      <RunProgress :run="r" :height="10" />
    </v-card>

    <v-card v-if="!filtered.length">
      <FoxEmptyState icon="tabler:player-play" title="ยังไม่มีรอบการทดสอบ" text="สร้างรอบเพื่อบันทึกผลรายขั้นตอนและหลักฐาน แล้วนำไปออกเอกสารได้ทันที">
        <v-btn v-if="canExecute" class="mt-3" color="primary" prepend-icon="tabler:plus" @click="dialog = true">สร้างรอบการทดสอบ</v-btn>
      </FoxEmptyState>
    </v-card>
  </div>

  <TestRunDialog v-model="dialog" :loading="saving" @save="onSave" />
  <FoxConfirmDialog
    v-model="confirmOpen"
    title="ลบรอบการทดสอบ?"
    :text="deleting ? `ผลการทดสอบของ ${deleting.name} รอบที่ ${deleting.round} จะถูกลบ (Test Case ไม่ได้รับผลกระทบ)` : ''"
    confirm-text="ลบ"
    @confirm="onDelete"
  />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.run-card {
  cursor: pointer;
  transition: transform 0.15s;
}

.run-card:hover {
  transform: translateY(-2px);
}
</style>
