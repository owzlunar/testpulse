<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useLeaveGuard } from '@/composables/useUnsavedChanges'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import FoxImageUpload from '@/components/ui/FoxImageUpload.vue'
import DefectDialog from '@/components/defects/DefectDialog.vue'
import RunProgress from '@/components/test-runs/RunProgress.vue'
import TestCasePriorityChip from '@/components/test-cases/TestCasePriorityChip.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { useAuthStore } from '@/stores/auth.store'
import { useDefectStore } from '@/stores/defect.store'
import { useRunStore } from '@/stores/run.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { DefectInput, DefectSeverity, ResultStatus, RunResult, TestCasePriority } from '@/types'
import { formatDateTime } from '@/utils/date'
import { defectStatusOf } from '@/domain/defect'
import { RESULT_STATUSES, deriveResult, resultOf, runCounts, runStatusOf, runTypeOf } from '@/domain/run'

const route = useRoute()
const runStore = useRunStore()
const defectStore = useDefectStore()
const testCaseStore = useTestCaseStore()
const { loaded } = storeToRefs(runStore)
const { canExecute } = useTestCasePermissions()
const auth = useAuthStore()
const canCloseRun = computed(() => auth.can('run.close'))
const { snackbar, notify } = useSnackbar()
const loader = useAsyncAction()
const saver = useAsyncAction()

onMounted(() => loader.run(() => Promise.all([runStore.ensureLoaded(), defectStore.ensureLoaded()])))

const run = computed(() => runStore.getById(String(route.params.id)))
const readonly = computed(() => !canExecute.value || run.value?.status === 'completed')

// --- case list ------------------------------------------------------------------------
type ListFilter = 'all' | 'untested' | 'problem'
const listFilter = ref<ListFilter>('all')
const results = computed(() => run.value?.results ?? [])
const visible = computed(() =>
  results.value.filter((r) =>
    listFilter.value === 'untested'
      ? r.status === 'untested'
      : listFilter.value === 'problem'
        ? r.status === 'failed' || r.status === 'blocked'
        : true,
  ),
)

const selectedId = ref<string | null>(null)
watch(
  results,
  (list) => {
    if (!selectedId.value && list.length) selectedId.value = (list.find((r) => r.status === 'untested') ?? list[0]).caseId
  },
  { immediate: true },
)

// --- editing draft of the selected result ------------------------------------------------
const draft = ref<RunResult | null>(null)
const saved = computed(() => results.value.find((r) => r.caseId === selectedId.value) ?? null)
watch(saved, (r) => (draft.value = r ? JSON.parse(JSON.stringify(r)) : null), { immediate: true })
const dirty = computed(() => !!draft.value && !!saved.value && JSON.stringify(draft.value) !== JSON.stringify(saved.value))
useLeaveGuard(() => dirty.value)

const derived = computed<ResultStatus>(() => (draft.value ? deriveResult(draft.value.stepResults) : 'untested'))
// a deleted case's id may now belong to another case: never resolve it
const caseNow = computed(() =>
  draft.value && run.value && !draft.value.caseDeleted ? testCaseStore.getById(draft.value.caseId, run.value.projectId) : undefined,
)
const changedSinceSnapshot = computed(() => !!caseNow.value && caseNow.value.version !== draft.value?.caseVersion)
// the result is still saved, but won't become the case's status (deleted / closed runs have their own notice)
const syncBlock = computed(() =>
  run.value && draft.value && !draft.value.caseDeleted && run.value.status !== 'completed' ? runStore.caseSyncBlock(run.value, draft.value) : null,
)

function setStep(i: number, status: ResultStatus) {
  if (!draft.value || readonly.value) return
  const step = draft.value.stepResults[i]
  step.status = step.status === status ? 'untested' : status
}

function passAll() {
  draft.value?.stepResults.forEach((s) => (s.status = 'passed'))
}

function resetAll() {
  draft.value?.stepResults.forEach((s) => Object.assign(s, { status: 'untested', actual: '' }))
}

// switching case with unsaved changes asks first
const pendingSwitch = ref<string | null>(null)
const confirmSwitch = ref(false)
function select(caseId: string) {
  if (caseId === selectedId.value) return
  if (dirty.value) {
    pendingSwitch.value = caseId
    confirmSwitch.value = true
  } else selectedId.value = caseId
}

function nextCaseId(): string | null {
  const list = results.value
  const i = list.findIndex((r) => r.caseId === selectedId.value)
  return [...list.slice(i + 1), ...list.slice(0, i)].find((r) => r.status === 'untested')?.caseId ?? null
}

async function save(goNext: boolean) {
  const r = run.value
  const d = draft.value
  if (!r || !d) return
  const ok = await saver.run(() => runStore.saveResult(r.id, { ...d, status: derived.value }))
  if (!ok) return
  notify(`บันทึกผล ${d.caseId}: ${resultOf(derived.value).label}`, derived.value === 'failed' ? 'error' : 'success')
  if (goNext) {
    const next = nextCaseId()
    if (next) selectedId.value = next
    else notify('ทดสอบครบทุกเคสในรอบนี้แล้ว')
  }
}

// --- defects --------------------------------------------------------------------------
const SEVERITY_BY_PRIORITY: Record<TestCasePriority, DefectSeverity> = { critical: 'critical', high: 'major', medium: 'minor', low: 'trivial' }
const defectOpen = ref(false)
const defectPreset = ref<Partial<DefectInput> | null>(null)

function reportDefect(stepIndex: number) {
  const r = run.value
  const d = draft.value
  if (!r || !d) return
  const step = d.steps[stepIndex]
  const sr = d.stepResults[stepIndex]
  defectPreset.value = {
    projectId: r.projectId,
    title: `${d.caseName}: ${step.action}`,
    caseId: d.caseId,
    runId: r.id,
    stepNumber: stepIndex + 1,
    severity: SEVERITY_BY_PRIORITY[d.priority],
    assignee: caseNow.value?.assignedDev ?? '',
    environment: [r.environment, r.build].filter(Boolean).join(' · '),
    stepsToReproduce: d.steps
      .slice(0, stepIndex + 1)
      .map((s, i) => `${i + 1}. ${s.action}${s.testData && s.testData !== '-' ? ` (${s.testData})` : ''}`)
      .join('\n'),
    expected: step.expectedResult,
    actual: sr.actual,
    evidence: [...sr.evidence],
  }
  defectOpen.value = true
}

function onDefectSave(input: DefectInput) {
  saver.run(
    () => defectStore.save(input),
    async (created) => {
      defectOpen.value = false
      if (draft.value && !draft.value.defectIds.includes(created.id)) {
        draft.value.defectIds.push(created.id)
        await save(false)
      }
      notify(`รายงาน ${created.id} แล้ว`, 'error')
    },
  )
}

const linkedDefects = computed(() => defectStore.defects.filter((x) => draft.value?.defectIds.includes(x.id)))

// --- close the round ---------------------------------------------------------------------
const confirmComplete = ref(false)
function complete() {
  const r = run.value
  if (r)
    saver.run(
      () => runStore.complete(r.id),
      () => notify(`ปิด ${r.name} รอบที่ ${r.round} แล้ว`),
    )
}
</script>

<template>
  <FoxPageSkeleton v-if="!loaded" :stats="0" :rows="2" />
  <v-card v-else-if="!run">
    <FoxEmptyState icon="tabler:file-unknown" title="ไม่พบรอบการทดสอบ" text="อาจถูกลบไปแล้ว หรืออยู่ในโปรเจกต์อื่น">
      <v-btn class="mt-3" color="primary" to="/test-runs">กลับไปหน้ารอบการทดสอบ</v-btn>
    </FoxEmptyState>
  </v-card>

  <template v-else>
    <FoxPageHeader
      :title="`${run.name} · รอบที่ ${run.round}`"
      :breadcrumbs="[{ title: 'Test Runs', to: '/test-runs' }, { title: `${run.name} #${run.round}` }]"
    >
      <template #actions>
        <v-btn
          variant="outlined"
          prepend-icon="tabler:file-description"
          :to="{ path: '/documents', query: { create: run.type === 'uat' ? 'uat' : 'test_summary', runId: run.id } }"
        >
          สร้างเอกสาร
        </v-btn>
        <v-btn v-if="run.status !== 'completed' && canCloseRun" color="success" prepend-icon="tabler:flag-check" @click="confirmComplete = true"
          >ปิดรอบ</v-btn
        >
      </template>
    </FoxPageHeader>

    <div class="fox-stack">
      <v-card class="fox-card-body">
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
          <v-chip :color="runTypeOf(run.type).tone" :prepend-icon="runTypeOf(run.type).icon" size="small" variant="tonal">{{
            runTypeOf(run.type).label
          }}</v-chip>
          <v-chip :color="runStatusOf(run.status).tone" :prepend-icon="runStatusOf(run.status).icon" size="small" variant="flat">{{
            runStatusOf(run.status).label
          }}</v-chip>
          <span class="text-body-2 text-muted"
            >{{ run.environment }}<template v-if="run.build"> · {{ run.build }}</template></span
          >
          <v-spacer />
          <v-chip v-if="readonly && run.status === 'completed'" size="small" variant="tonal" prepend-icon="tabler:lock"
            >ปิดรอบแล้ว · ดูอย่างเดียว</v-chip
          >
        </div>
        <RunProgress :run="run" :height="10" />
      </v-card>

      <v-row class="fox-grid">
        <!-- case list -->
        <v-col cols="12" md="4">
          <v-card class="exec-list">
            <div class="fox-card-body pb-2">
              <v-btn-toggle v-model="listFilter" mandatory density="compact" variant="outlined" color="primary" divided class="w-100">
                <v-btn value="all" class="flex-grow-1">ทั้งหมด {{ results.length }}</v-btn>
                <v-btn value="untested" class="flex-grow-1">รอทดสอบ {{ runCounts(run).untested }}</v-btn>
                <v-btn value="problem" class="flex-grow-1">มีปัญหา {{ runCounts(run).failed + runCounts(run).blocked }}</v-btn>
              </v-btn-toggle>
            </div>
            <v-list class="px-2 exec-list__items">
              <v-list-item
                v-for="r in visible"
                :key="r.caseId"
                :active="r.caseId === selectedId"
                color="primary"
                class="py-2"
                @click="select(r.caseId)"
              >
                <template #prepend>
                  <v-icon :icon="resultOf(r.status).icon" :color="resultOf(r.status).tone" class="mr-3" />
                </template>
                <v-list-item-title class="text-subtitle-2">
                  <span class="fox-num">{{ r.caseId }}</span
                  ><span v-if="r.caseDeleted" class="text-caption text-muted"> (ลบแล้ว)</span>
                </v-list-item-title>
                <v-list-item-subtitle class="text-caption">{{ r.caseName }}</v-list-item-subtitle>
                <template v-if="r.defectIds.length" #append>
                  <v-chip size="x-small" color="error" variant="tonal" prepend-icon="tabler:bug">{{ r.defectIds.length }}</v-chip>
                </template>
              </v-list-item>
              <div v-if="!visible.length" class="text-body-2 text-muted text-center py-6">ไม่มีเคสในตัวกรองนี้</div>
            </v-list>
          </v-card>
        </v-col>

        <!-- execution -->
        <v-col cols="12" md="8">
          <v-card v-if="draft" class="fox-card-body">
            <div class="d-flex flex-wrap align-start justify-space-between ga-3 mb-2">
              <div class="overflow-hidden">
                <div class="d-flex flex-wrap align-center ga-2 mb-1">
                  <v-chip color="primary" size="small" variant="flat" class="fox-num">{{ draft.caseId }}</v-chip>
                  <span class="text-caption text-muted fox-num">{{ draft.caseVersion }}</span>
                  <TestCasePriorityChip :priority="draft.priority" />
                </div>
                <h2 class="text-h5">{{ draft.caseName }}</h2>
                <div v-if="draft.executedAt" class="text-caption text-muted">
                  ทดสอบล่าสุดโดย {{ draft.executedBy }} · {{ formatDateTime(draft.executedAt) }}
                </div>
              </div>
              <div class="text-end">
                <div class="text-caption text-muted">ผลของเคส (คำนวณจากขั้นตอน)</div>
                <v-chip :color="resultOf(derived).tone" :prepend-icon="resultOf(derived).icon" variant="flat">{{ resultOf(derived).label }}</v-chip>
              </div>
            </div>

            <v-alert v-if="draft.caseDeleted" type="warning" variant="tonal" density="compact" icon="tabler:trash" class="my-3">
              Test Case นี้ถูกลบแล้ว ผลในรอบนี้เก็บไว้เป็นประวัติ และจะไม่อัปเดตสถานะของเคสใด
            </v-alert>
            <v-alert v-if="changedSinceSnapshot" type="info" variant="tonal" density="compact" icon="tabler:git-branch" class="my-3">
              Test Case ถูกแก้ไขเป็น {{ caseNow?.version }} หลังสร้างรอบนี้ ผลด้านล่างอ้างอิงขั้นตอนของ {{ draft.caseVersion }}
              และจะไม่เปลี่ยนสถานะปัจจุบันของเคส
            </v-alert>
            <v-alert v-else-if="syncBlock" type="info" variant="tonal" density="compact" icon="tabler:info-circle" class="my-3">
              บันทึกผลในรอบนี้ได้ แต่จะไม่เปลี่ยนสถานะปัจจุบันของ {{ draft.caseId }}: {{ syncBlock }}
            </v-alert>
            <v-alert v-if="caseNow?.prerequisite" variant="tonal" color="primary" density="compact" icon="tabler:list-check" class="my-3 exec-pre">
              <strong>Prerequisite:</strong> {{ caseNow.prerequisite }}
            </v-alert>

            <div v-if="!readonly" class="d-flex flex-wrap ga-2 my-4">
              <v-btn variant="tonal" color="success" size="small" prepend-icon="tabler:checks" @click="passAll">ผ่านทุกขั้นตอน</v-btn>
              <v-btn variant="text" size="small" prepend-icon="tabler:restore" @click="resetAll">ล้างผล</v-btn>
            </div>

            <!-- steps -->
            <div class="d-flex flex-column ga-3">
              <div
                v-for="(step, i) in draft.steps"
                :key="step.id"
                class="exec-step"
                :class="`exec-step--${draft.stepResults[i]?.status ?? 'untested'}`"
              >
                <div class="d-flex flex-wrap align-start ga-3">
                  <v-avatar
                    :color="resultOf(draft.stepResults[i].status).tone"
                    size="32"
                    :variant="draft.stepResults[i].status === 'untested' ? 'tonal' : 'flat'"
                  >
                    <span class="text-subtitle-2 fox-num">{{ i + 1 }}</span>
                  </v-avatar>
                  <div class="flex-grow-1 exec-step__text">
                    <div class="text-subtitle-2">{{ step.action }}</div>
                    <div v-if="step.testData && step.testData !== '-'" class="text-body-2 text-muted">Test data: {{ step.testData }}</div>
                    <div class="text-body-2 text-success">คาดหวัง: {{ step.expectedResult }}</div>
                  </div>
                  <div class="d-flex ga-1" role="group" :aria-label="`ผลขั้นตอนที่ ${i + 1}`">
                    <v-btn
                      v-for="s in RESULT_STATUSES.filter((x) => x.value !== 'untested')"
                      :key="s.value"
                      :color="s.tone"
                      :variant="draft.stepResults[i].status === s.value ? 'flat' : 'tonal'"
                      :disabled="readonly"
                      size="small"
                      :prepend-icon="s.icon"
                      :aria-pressed="draft.stepResults[i].status === s.value"
                      @click="setStep(i, s.value)"
                    >
                      {{ s.label }}
                    </v-btn>
                  </div>
                </div>
                <v-expand-transition>
                  <div v-if="draft.stepResults[i].status === 'failed' || draft.stepResults[i].status === 'blocked'" class="exec-step__detail">
                    <label class="fox-label" :for="`act-${i}`">ผลที่เกิดขึ้นจริง</label>
                    <v-textarea
                      :id="`act-${i}`"
                      v-model="draft.stepResults[i].actual"
                      rows="2"
                      auto-grow
                      :readonly="readonly"
                      placeholder="อธิบายสิ่งที่เกิดขึ้น ข้อความ Error หรือ Response"
                    />
                    <div class="fox-label mt-3">หลักฐาน</div>
                    <FoxImageUpload v-model="draft.stepResults[i].evidence" :readonly="readonly" />
                    <v-btn
                      v-if="!readonly && draft.stepResults[i].status === 'failed' && auth.can('defect.report')"
                      class="mt-3"
                      color="error"
                      variant="tonal"
                      prepend-icon="tabler:bug"
                      @click="reportDefect(i)"
                    >
                      รายงาน Defect จากขั้นตอนนี้
                    </v-btn>
                  </div>
                </v-expand-transition>
              </div>
            </div>

            <v-divider class="my-6" />

            <v-row dense class="fox-form-grid">
              <v-col cols="12" md="6">
                <label class="fox-label" for="exec-actual">สรุปผลการทดสอบ</label>
                <v-textarea
                  id="exec-actual"
                  v-model="draft.actualResults"
                  rows="3"
                  auto-grow
                  :readonly="readonly"
                  placeholder="เช่น ทำงานถูกต้อง Response time เฉลี่ย 230ms"
                />
              </v-col>
              <v-col cols="12" md="6">
                <label class="fox-label" for="exec-notes">หมายเหตุ</label>
                <v-textarea id="exec-notes" v-model="draft.notes" rows="3" auto-grow :readonly="readonly" placeholder="สิ่งที่ผู้ตรวจรับควรรู้" />
              </v-col>
              <v-col cols="12">
                <span class="fox-label">หลักฐานของเคส</span>
                <FoxImageUpload v-model="draft.evidence" :readonly="readonly" />
              </v-col>
              <v-col v-if="linkedDefects.length" cols="12">
                <span class="fox-label">Defect ที่เชื่อมโยง</span>
                <div class="d-flex flex-wrap ga-2">
                  <v-chip
                    v-for="df in linkedDefects"
                    :key="df.id"
                    :color="defectStatusOf(df.status).tone"
                    :prepend-icon="defectStatusOf(df.status).icon"
                    variant="tonal"
                    :to="{ path: '/defects', query: { id: df.id } }"
                  >
                    {{ df.id }} · {{ df.title }}
                  </v-chip>
                </div>
              </v-col>
            </v-row>

            <div v-if="!readonly" class="d-flex flex-wrap align-center ga-3 mt-6">
              <span v-if="dirty" class="text-body-2 text-warning d-inline-flex align-center ga-1"
                ><v-icon icon="tabler:point" size="14" />ยังไม่ได้บันทึก</span
              >
              <v-spacer />
              <v-btn variant="outlined" :loading="saver.busy.value" @click="save(false)">บันทึก</v-btn>
              <v-btn color="primary" append-icon="tabler:chevron-right" :loading="saver.busy.value" @click="save(true)">บันทึกและไปเคสถัดไป</v-btn>
            </div>
          </v-card>
          <v-card v-else>
            <FoxEmptyState icon="tabler:hand-click" title="เลือกเคสทางซ้ายเพื่อเริ่มทดสอบ" />
          </v-card>
        </v-col>
      </v-row>
    </div>

    <DefectDialog v-model="defectOpen" :preset="defectPreset" :loading="saver.busy.value" @save="onDefectSave" />
    <FoxConfirmDialog
      v-model="confirmSwitch"
      title="ทิ้งผลที่ยังไม่บันทึก?"
      text="ผลการทดสอบของเคสนี้ยังไม่ได้บันทึก"
      confirm-text="ทิ้งและเปลี่ยนเคส"
      tone="warning"
      @confirm="selectedId = pendingSwitch"
    />
    <FoxConfirmDialog
      v-model="confirmComplete"
      title="ปิดรอบการทดสอบ?"
      :text="`ยังมี ${runCounts(run).untested} เคสที่ไม่ได้ทดสอบ หลังปิดรอบจะแก้ไขผลไม่ได้`"
      confirm-text="ปิดรอบ"
      tone="success"
      @confirm="complete"
    />
  </template>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.exec-list {
  position: sticky;
  top: 88px;
}

.exec-list__items {
  max-height: calc(100vh - 260px);
  overflow-y: auto;
}

.exec-pre {
  white-space: pre-line;
}

.exec-step {
  padding: 16px;
  border-radius: var(--fox-radius-control);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-left-width: 4px;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}

.exec-step--passed {
  border-left-color: rgb(var(--v-theme-success));
}

.exec-step--failed {
  border-left-color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.03);
}

.exec-step--blocked {
  border-left-color: rgb(var(--v-theme-caution));
}

.exec-step--skipped {
  border-left-color: rgb(var(--v-theme-secondary));
}

.exec-step__text {
  min-width: 220px;
  white-space: pre-line;
}

.exec-step__detail {
  margin-top: 16px;
  padding-left: 44px;
}

@media (max-width: 599.98px) {
  .exec-step__detail {
    padding-left: 0;
  }
}

@media (max-width: 959.98px) {
  .exec-list {
    position: static;
  }

  .exec-list__items {
    max-height: 280px;
  }
}
</style>
