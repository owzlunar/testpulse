<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { storeToRefs } from 'pinia'
import type { VForm } from 'vuetify/components'
import TestCaseStatusChip from '@/components/test-cases/TestCaseStatusChip.vue'
import TestCasePriorityChip from '@/components/test-cases/TestCasePriorityChip.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import { useRunStore } from '@/stores/run.store'
import type { TestRunInput } from '@/types'
import { addDays, todayISO } from '@/utils/date'
import { required } from '@/utils/validators'
import { RUN_TYPES } from '@/domain/run'

const open = defineModel<boolean>({ default: false })
withDefaults(defineProps<{ loading?: boolean }>(), { loading: false })
const emit = defineEmits<{ save: [input: TestRunInput] }>()

const runStore = useRunStore()
const auth = useAuthStore()
const { currentProject, currentCases } = storeToRefs(useProjectStore())

const formRef = ref<VForm>()
const empty = (): TestRunInput => ({
  projectId: currentProject.value?.id ?? '',
  name: '',
  type: 'functional',
  round: 1,
  environment: 'Staging',
  build: '',
  plannedStart: todayISO(),
  plannedEnd: addDays(todayISO(), 5),
  caseIds: [],
  assignee: '',
})
const form = reactive<TestRunInput>(empty())

const lastRun = computed(() => runStore.current[0] ?? null)
const nameOptions = computed(() => [...new Set(runStore.current.map((r) => r.name))])
const qaUsers = computed(() => auth.usersIn('qa').map((u) => u.name))

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, empty(), {
      name: lastRun.value?.name ?? `${currentProject.value?.key ?? ''} · Functional`,
      caseIds: currentCases.value.map((c) => c.id),
    })
    form.round = runStore.nextRound(form.name)
  },
  { immediate: true },
)
useUnsavedChanges(open, () => form)
watch(
  () => form.name,
  (name) => (form.round = runStore.nextRound(name)),
)

// --- case selection ------------------------------------------------------------------
const cases = computed(() => [...currentCases.value].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })))
const failedLastRound = computed(
  () => new Set(lastRun.value?.results.filter((r) => !r.caseDeleted && (r.status === 'failed' || r.status === 'blocked')).map((r) => r.caseId)),
)

const presets = computed(() => [
  { label: 'ทั้งหมด', ids: cases.value.map((c) => c.id) },
  { label: 'ยังไม่ผ่าน', ids: cases.value.filter((c) => c.status !== 'passed').map((c) => c.id) },
  { label: `Fail / Blocked รอบล่าสุด`, ids: cases.value.filter((c) => failedLastRound.value.has(c.id)).map((c) => c.id) },
  { label: 'Critical และ High', ids: cases.value.filter((c) => c.priority === 'critical' || c.priority === 'high').map((c) => c.id) },
])

function toggle(id: string) {
  form.caseIds = form.caseIds.includes(id) ? form.caseIds.filter((x) => x !== id) : [...form.caseIds, id]
}

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid || !form.caseIds.length) return
  emit('save', { ...form })
}
</script>

<template>
  <v-dialog v-model="open" max-width="960" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">สร้างรอบการทดสอบ</h2>
          <p class="text-body-2 text-muted">เลือกเคสที่จะทดสอบในรอบนี้ ระบบจะเก็บสำเนาเคส ณ เวลานี้ไว้เป็นหลักฐาน</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row class="fox-grid">
            <v-col cols="12" md="5">
              <v-row dense class="fox-form-grid">
                <v-col cols="12">
                  <label class="fox-label" for="run-name">ชื่อรอบ *</label>
                  <v-combobox id="run-name" v-model="form.name" :items="nameOptions" placeholder="เช่น Sprint 43 · Regression" :rules="[required]" />
                </v-col>
                <v-col cols="8">
                  <label class="fox-label" for="run-type">ประเภท</label>
                  <v-select id="run-type" v-model="form.type" :items="RUN_TYPES" item-title="label" item-value="value">
                    <template #item="{ props: item, item: { raw } }">
                      <v-list-item v-bind="item" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
                    </template>
                  </v-select>
                </v-col>
                <v-col cols="4">
                  <label class="fox-label" for="run-round">รอบที่</label>
                  <v-text-field id="run-round" v-model.number="form.round" type="number" min="1" />
                </v-col>
                <v-col cols="6">
                  <label class="fox-label" for="run-env">Environment *</label>
                  <v-combobox id="run-env" v-model="form.environment" :items="['Staging', 'UAT', 'SIT', 'Pre-production']" :rules="[required]" />
                </v-col>
                <v-col cols="6">
                  <label class="fox-label" for="run-build">Build / Version</label>
                  <v-text-field id="run-build" v-model="form.build" placeholder="v3.2.0-rc3" />
                </v-col>
                <v-col cols="6">
                  <label class="fox-label" for="run-start">เริ่ม</label>
                  <v-text-field id="run-start" v-model="form.plannedStart" type="date" />
                </v-col>
                <v-col cols="6">
                  <label class="fox-label" for="run-end">สิ้นสุด</label>
                  <v-text-field id="run-end" v-model="form.plannedEnd" type="date" />
                </v-col>
                <v-col cols="12">
                  <label class="fox-label" for="run-assignee">ผู้ทดสอบ</label>
                  <v-select
                    id="run-assignee"
                    v-model="form.assignee"
                    :items="qaUsers"
                    placeholder="ตาม QA ของแต่ละเคส"
                    prepend-inner-icon="tabler:user-check"
                    clearable
                  />
                </v-col>
              </v-row>
            </v-col>

            <v-col cols="12" md="7">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="fox-label mb-0">Test Cases ({{ form.caseIds.length }}/{{ cases.length }})</span>
                <v-btn variant="text" size="small" @click="form.caseIds = []">ล้าง</v-btn>
              </div>
              <div class="d-flex flex-wrap ga-2 mb-3">
                <v-chip
                  v-for="p in presets"
                  :key="p.label"
                  size="small"
                  variant="tonal"
                  color="primary"
                  :disabled="!p.ids.length"
                  @click="form.caseIds = p.ids"
                >
                  {{ p.label }} <span class="fox-num ml-1">{{ p.ids.length }}</span>
                </v-chip>
              </div>
              <div class="run-cases">
                <label v-for="c in cases" :key="c.id" class="run-case" :class="{ 'run-case--sub': c.parentId }">
                  <v-checkbox-btn
                    :model-value="form.caseIds.includes(c.id)"
                    density="compact"
                    class="flex-grow-0"
                    @update:model-value="toggle(c.id)"
                  />
                  <span class="text-subtitle-2 text-primary fox-num">{{ c.id }}</span>
                  <span class="text-body-2 text-truncate flex-grow-1">{{ c.name }}</span>
                  <TestCasePriorityChip :priority="c.priority" />
                  <TestCaseStatusChip :status="c.status" size="x-small" />
                </label>
              </div>
              <div v-if="!form.caseIds.length" class="text-caption text-error mt-2">เลือกอย่างน้อย 1 เคส</div>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />
      <div class="d-flex justify-end ga-3 fox-card-body py-4">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:player-play" :loading="loading" :disabled="!form.caseIds.length" @click="submit">
          สร้างรอบ ({{ form.caseIds.length }} เคส)
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.run-cases {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--fox-radius-control);
}

.run-case {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 4px;
  cursor: pointer;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.run-case:last-child {
  border-bottom: 0;
}

.run-case:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}

.run-case--sub {
  padding-left: 28px;
}
</style>
