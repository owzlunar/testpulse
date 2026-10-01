<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { VForm, VTextarea } from 'vuetify/components'
import FoxImageUpload from '@/components/ui/FoxImageUpload.vue'
import TestCaseAuditList from './TestCaseAuditList.vue'
import TestCaseVersionTimeline from './TestCaseVersionTimeline.vue'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { requirementsForCase } from '@/services/requirement.service'
import { PRIORITIES, ROOT_CAUSES, STATUSES, hasSpecChanges } from '@/services/test-case.service'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import { useRequirementStore } from '@/stores/requirement.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase, TestCaseInput, TestStep } from '@/types'
import { addDays, todayISO } from '@/utils/date'
import { required } from '@/utils/validators'

type Tab = 'spec' | 'steps' | 'results' | 'history'
type StepField = 'action' | 'testData' | 'expectedResult'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    /** case to edit, or null to create */
    testCase?: TestCase | null
    /** create a sub-case under this parent */
    parentId?: string | null
    /** saving in progress (the parent closes the dialog when done) */
    loading?: boolean
    /** pre-filled fields for a new case (template / clone) */
    preset?: Partial<TestCase> | null
  }>(),
  { testCase: null, parentId: null, loading: false, preset: null },
)
const emit = defineEmits<{ save: [input: TestCaseInput] }>()

const auth = useAuthStore()
const { users, currentUser } = storeToRefs(auth)
const { currentProject, currentCases } = storeToRefs(useProjectStore())
const testCaseStore = useTestCaseStore()
const requirementStore = useRequirementStore()
const requirementOptions = computed(() =>
  requirementStore.current.map((r) => ({ title: `${r.code}: ${r.title}`, value: r.id, code: r.code })),
)

// linked Requirement records are the source of truth; the text field is an optional note,
// required only when nothing is linked (no copy of the requirement title is stored on the case)
const hasLinkedRequirement = computed(() => !!form.requirementIds?.length)
const requirementField = ref<VTextarea>()

function onRequirementsPicked(ids: string[]) {
  form.requirementIds = ids
  // a link satisfies the requirement: clear a "required" error shown on the text field
  if (ids.length) requirementField.value?.resetValidation()
}

/** a case linked only by its text ("REQ-PAY-01: …") shows that link in the picker; saving stores it */
function linkLegacyRequirement() {
  if (!props.testCase || form.requirementIds?.length) return
  form.requirementIds = requirementsForCase(props.testCase, requirementStore.requirements).map((r) => r.id)
}

const requirementRule = (v: string) => hasLinkedRequirement.value || !!v?.trim() || 'เลือก Requirement ที่เกี่ยวข้อง หรือระบุ Requirement เป็นข้อความ'
const { canEdit, canCreate, allowedStatuses } = useTestCasePermissions()

const formRef = ref<VForm>()
const tab = ref<Tab>('spec')
const changeSummary = ref('')
const bumpMajor = ref(false)
/** the one step cell shown as a textarea; every other cell shows plain text */
const editingStep = ref<{ id: string; field: StepField } | null>(null)

const newStep = (n: number): TestStep => ({ id: `s-${Date.now()}-${n}`, stepNumber: n, action: '', testData: '', expectedResult: '' })

const empty = (): Omit<TestCase, 'createdAt' | 'updatedAt'> => ({
  id: '', numericId: 101, parentId: null, projectId: '', requirement: '', testScenario: '', name: '', description: '',
  prerequisite: '', steps: [newStep(1)], expectedResults: '', expectedImages: [], actualResults: '', actualImages: [],
  status: 'pending', priority: 'medium', expiryDate: addDays(todayISO(), 7), assignedTo: '', assignedDev: '', version: 'v1.0',
})
const form = reactive(empty())

const isEdit = computed(() => !!props.testCase)
const isArchived = computed(() => !!props.testCase?.archivedAt)
// archived cases can only be viewed (restore them from the archive to edit)
const readonly = computed(() => (isEdit.value ? !canEdit.value || isArchived.value : !canCreate.value))
const title = computed(() =>
  isEdit.value ? `${readonly.value ? '' : 'แก้ไข '}${form.id}` : form.parentId ? `สร้าง Sub-case ภายใต้ ${form.parentId}` : 'สร้าง Test Case ใหม่',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  requirementStore.ensureLoaded().then(linkLegacyRequirement, () => {})
  tab.value = 'spec'
  changeSummary.value = ''
  bumpMajor.value = false
  editingStep.value = null
  const tc = props.testCase
  if (tc) {
    Object.assign(form, empty(), JSON.parse(JSON.stringify(tc)), { assignedTo: tc.assignedTo || currentUser.value.name })
  } else {
    Object.assign(form, empty(), {
      projectId: currentProject.value?.id ?? '',
      parentId: props.parentId,
      assignedTo: currentUser.value.name,
      ...(props.preset ? JSON.parse(JSON.stringify(props.preset)) : {}),
      ...testCaseStore.nextId(currentProject.value?.id ?? '', props.parentId),
    })
    renumber()
  }
}, { immediate: true })

function onParentChange(parentId: string | null) {
  if (isEdit.value) return
  Object.assign(form, { parentId }, testCaseStore.nextId(form.projectId, parentId))
}

// --- options -----------------------------------------------------------------
const parentOptions = computed(() => [
  { title: '— ไม่มี (เป็น Test Case หลัก) —', value: null },
  ...currentCases.value.filter((tc) => !tc.parentId && tc.id !== props.testCase?.id).map((tc) => ({ title: `${tc.id}: ${tc.name}`, value: tc.id })),
])
const peopleOf = (role: 'DEV' | 'QA', current?: string) => {
  const names = users.value.filter((u) => u.role === role).map((u) => u.name)
  return current && !names.includes(current) ? [current, ...names] : names
}
const devOptions = computed(() => peopleOf('DEV', form.assignedDev))
const qaOptions = computed(() => peopleOf('QA', form.assignedTo))
// a role that can't give verdicts still sees the current status in the list
const statusOptions = computed(() =>
  STATUSES.filter((s) => s.value === form.status || allowedStatuses.value.some((a) => a.value === s.value)),
)

// --- steps -------------------------------------------------------------------
const stepFields: { key: StepField; label: string; placeholder: string }[] = [
  { key: 'action', label: 'ขั้นตอน (Action)', placeholder: 'เช่น คลิกปุ่มชำระเงิน' },
  { key: 'testData', label: 'Test Data', placeholder: 'เช่น amount=1500' },
  { key: 'expectedResult', label: 'Expected Result', placeholder: 'เช่น แสดง QR Code' },
]

const isEditingStep = (step: TestStep, field: StepField) => editingStep.value?.id === step.id && editingStep.value.field === field

function editStep(step: TestStep, field: StepField) {
  if (!readonly.value) editingStep.value = { id: step.id, field }
}

function stopEditingStep(step: TestStep, field: StepField) {
  if (isEditingStep(step, field)) editingStep.value = null
}

function addStep() {
  const step = newStep(form.steps.length + 1)
  form.steps.push(step)
  editStep(step, 'action')
}

function removeStep(index: number) {
  form.steps.splice(index, 1)
  renumber()
}

function moveStep(index: number, delta: -1 | 1) {
  const to = index + delta
  if (to < 0 || to >= form.steps.length) return
  const [step] = form.steps.splice(index, 1)
  form.steps.splice(to, 0, step)
  renumber()
}

function renumber() {
  form.steps.forEach((s, i) => (s.stepNumber = i + 1))
}

// paste rows copied from Excel / Google Sheets: Action <tab> Test Data <tab> Expected
const pasteOpen = ref(false)
const pasteText = ref('')
const pastedRows = computed(() =>
  pasteText.value
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean))
    .map(([action = '', testData = '', expectedResult = '']) => ({ action, testData, expectedResult })),
)

function applyPaste(mode: 'append' | 'replace') {
  const rows = pastedRows.value.map((r, i) => ({ ...newStep(i), ...r }))
  const keep = form.steps.filter((s) => s.action || s.testData || s.expectedResult)
  form.steps = mode === 'replace' ? rows : [...keep, ...rows]
  renumber()
  pasteText.value = ''
  pasteOpen.value = false
}

// --- save --------------------------------------------------------------------
async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) {
    // jump to the first tab with an error
    tab.value = !form.name || requirementRule(form.requirement) !== true || !form.testScenario || !form.expiryDate ? 'spec' : 'results'
    return
  }
  renumber()
  const executed = form.status !== 'untested' && form.status !== 'pending' && form.status !== 'ready_for_test'
  emit('save', {
    ...JSON.parse(JSON.stringify(form)),
    changeSummary: changeSummary.value.trim() || undefined,
    bumpMajor: bumpMajor.value,
    executedBy: executed ? currentUser.value.name : form.executedBy,
    executedAt: executed ? new Date().toISOString() : form.executedAt,
  })
}

// --- versioning (mirrors the store: a version = a change to what is tested) ------------
const specChanged = computed(() => !!props.testCase && hasSpecChanges(props.testCase, form, requirementStore.requirements))
const invalidatesPass = computed(() => !readonly.value && specChanged.value && props.testCase?.status === 'passed' && form.status === 'passed')

const rules = { required }
</script>

<template>
  <v-dialog v-model="open" max-width="920" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-2">
        <div class="overflow-hidden">
          <div class="d-flex flex-wrap align-center ga-2">
            <h2 class="text-h5">{{ title }}</h2>
            <v-chip size="small" color="primary" variant="tonal" class="fox-num">{{ form.version }}</v-chip>
            <v-chip v-if="isArchived" size="small" color="secondary" variant="tonal" prepend-icon="tabler:archive">อยู่ในคลังเก็บ</v-chip>
            <v-chip v-else-if="readonly" size="small" color="secondary" variant="tonal" prepend-icon="tabler:eye">ดูอย่างเดียว</v-chip>
          </div>
          <p class="text-body-2 text-muted text-truncate">{{ currentProject?.name }}</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <v-tabs v-model="tab" show-arrows class="px-4">
        <v-tab value="spec" prepend-icon="tabler:clipboard-text">ข้อกำหนด</v-tab>
        <v-tab value="steps" prepend-icon="tabler:list-numbers">
          ขั้นตอน <span class="text-caption text-muted fox-num ml-1">{{ form.steps.length }}</span>
        </v-tab>
        <v-tab value="results" prepend-icon="tabler:photo">ผลลัพธ์ & หลักฐาน</v-tab>
        <v-tab v-if="isEdit" value="history" prepend-icon="tabler:history">ประวัติ</v-tab>
      </v-tabs>
      <v-divider />

      <v-card-text class="fox-card-body">
        <v-form ref="formRef" :readonly="readonly" @submit.prevent="submit">
          <v-window v-model="tab">
            <!-- SPEC -->
            <v-window-item value="spec" eager>
              <v-row dense class="fox-form-grid">
                <v-col v-if="!isEdit || form.parentId" cols="12" sm="6">
                  <label class="fox-label" for="tc-parent">เคสหลัก (Parent)</label>
                  <v-select
                    id="tc-parent"
                    :model-value="form.parentId"
                    :items="parentOptions"
                    :disabled="isEdit"
                    prepend-inner-icon="tabler:subtask"
                    @update:model-value="onParentChange"
                  />
                </v-col>
                <v-col cols="12" :sm="!isEdit || form.parentId ? 3 : 6">
                  <label class="fox-label" for="tc-id">Test Case ID *</label>
                  <v-text-field id="tc-id" v-model="form.id" :rules="[rules.required]" :disabled="isEdit" />
                </v-col>
                <v-col cols="12" :sm="!isEdit || form.parentId ? 3 : 6">
                  <label class="fox-label" for="tc-priority">Priority *</label>
                  <v-select id="tc-priority" v-model="form.priority" :items="PRIORITIES" item-title="label" item-value="value">
                    <template #item="{ props: item, item: { raw } }">
                      <v-list-item v-bind="item" :prepend-icon="raw.icon" :base-color="raw.tone" :subtitle="raw.hint" />
                    </template>
                  </v-select>
                </v-col>

                <v-col cols="12">
                  <label class="fox-label" for="tc-name">ชื่อ Test Case *</label>
                  <v-text-field id="tc-name" v-model="form.name" placeholder="เช่น ตรวจสอบการส่ง SMS OTP สำเร็จ" :rules="[rules.required]" />
                </v-col>

                <v-col cols="12">
                  <label class="fox-label" for="tc-reqlinks">Requirements ที่เกี่ยวข้อง</label>
                  <v-autocomplete
                    id="tc-reqlinks"
                    :model-value="form.requirementIds ?? []"
                    :items="requirementOptions"
                    :loading="!requirementStore.loaded"
                    multiple
                    chips
                    closable-chips
                    prepend-inner-icon="tabler:link"
                    placeholder="เชื่อมกับ Requirement เพื่อทำ Traceability Matrix"
                    @update:model-value="onRequirementsPicked"
                  >
                    <template #chip="{ props: chip, item }">
                      <v-chip v-bind="chip" size="small" color="primary" variant="tonal">{{ item.raw.code }}</v-chip>
                    </template>
                  </v-autocomplete>
                </v-col>
                <v-col cols="12" sm="6">
                  <label class="fox-label" for="tc-req">{{ hasLinkedRequirement ? 'รายละเอียด Requirement เพิ่มเติม' : 'Requirement *' }}</label>
                  <v-textarea
                    id="tc-req"
                    ref="requirementField"
                    v-model="form.requirement"
                    rows="3"
                    auto-grow
                    :placeholder="hasLinkedRequirement ? 'ไม่บังคับ: เงื่อนไขเฉพาะของเคสนี้ที่ไม่มีใน Requirement' : 'REQ-ID หรือเกณฑ์ที่ระบบต้องตอบสนอง (ถ้ายังไม่มีใน Requirements)'"
                    :rules="[requirementRule]"
                  />
                </v-col>
                <v-col cols="12" sm="6">
                  <label class="fox-label" for="tc-scenario">Test Scenario *</label>
                  <v-textarea id="tc-scenario" v-model="form.testScenario" rows="3" auto-grow placeholder="สถานการณ์ที่ต้องการทดสอบ" :rules="[rules.required]" />
                </v-col>
                <v-col cols="12" sm="6">
                  <label class="fox-label" for="tc-pre">Prerequisite</label>
                  <v-textarea id="tc-pre" v-model="form.prerequisite" rows="2" auto-grow placeholder="สิ่งที่ต้องเตรียมก่อนทดสอบ" />
                </v-col>
                <v-col cols="12" sm="6">
                  <label class="fox-label" for="tc-desc">คำอธิบายเพิ่มเติม</label>
                  <v-textarea id="tc-desc" v-model="form.description" rows="2" auto-grow placeholder="หมายเหตุหรือบริบทแวดล้อม" />
                </v-col>

                <v-col cols="12" sm="4">
                  <label class="fox-label" for="tc-due">วันครบกำหนด *</label>
                  <v-text-field id="tc-due" v-model="form.expiryDate" type="date" prepend-inner-icon="tabler:calendar-due" :rules="[rules.required]" />
                </v-col>
                <v-col cols="12" sm="4">
                  <label class="fox-label" for="tc-dev">Developer ผู้รับผิดชอบ</label>
                  <v-select id="tc-dev" v-model="form.assignedDev" :items="devOptions" placeholder="ยังไม่ระบุ" prepend-inner-icon="tabler:code" clearable />
                </v-col>
                <v-col cols="12" sm="4">
                  <label class="fox-label" for="tc-qa">QA ผู้รับผิดชอบ</label>
                  <v-select id="tc-qa" v-model="form.assignedTo" :items="qaOptions" placeholder="ยังไม่ระบุ" prepend-inner-icon="tabler:shield-check" clearable />
                </v-col>

                <template v-if="isEdit && !readonly">
                  <v-col cols="12">
                    <v-divider class="mb-2" />
                    <span class="text-overline text-muted">การปรับเวอร์ชัน</span>
                    <p class="text-caption text-muted">
                      {{ specChanged ? `บันทึกแล้วจะขึ้นเวอร์ชันใหม่ต่อจาก ${testCase?.version}` : 'ยังไม่ได้แก้ข้อกำหนดหรือขั้นตอน เวอร์ชันจะไม่เปลี่ยน (สถานะ กำหนดส่ง และผู้รับผิดชอบบันทึกใน Audit)' }}
                    </p>
                  </v-col>
                  <v-col cols="12" sm="8">
                    <label class="fox-label" for="tc-changelog">สรุปการแก้ไข (Changelog)</label>
                    <v-text-field id="tc-changelog" v-model="changeSummary" placeholder="เช่น เพิ่ม Step ตรวจสอบ Callback" />
                  </v-col>
                  <v-col cols="12" sm="4" class="d-flex align-end">
                    <v-checkbox v-model="bumpMajor" label="Major release (+1.0)" />
                  </v-col>
                </template>
              </v-row>
            </v-window-item>

            <!-- STEPS -->
            <v-window-item value="steps" eager>
              <div class="d-flex align-center justify-space-between mb-3">
                <span class="text-body-2 text-muted">คลิกช่องเพื่อแก้ไข (Enter ขึ้นบรรทัดใหม่) ใช้ลูกศรเพื่อจัดลำดับ</span>
                <div v-if="!readonly" class="d-flex ga-2">
                  <v-btn variant="outlined" size="small" prepend-icon="tabler:clipboard-text" @click="pasteOpen = !pasteOpen">วางจาก Excel</v-btn>
                  <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:plus" @click="addStep">เพิ่มขั้นตอน</v-btn>
                </div>
              </div>
              <v-expand-transition>
                <v-card v-if="pasteOpen" color="light-primary" variant="flat" class="pa-4 mb-4">
                  <label class="fox-label" for="tc-paste">คัดลอกแถวจาก Excel / Google Sheets แล้ววางที่นี่</label>
                  <p class="text-caption text-muted mb-2">คอลัมน์ตามลำดับ: ขั้นตอน (Action) · Test Data · Expected Result — หนึ่งบรรทัดต่อหนึ่งขั้นตอน</p>
                  <v-textarea id="tc-paste" v-model="pasteText" rows="4" auto-grow bg-color="surface" placeholder="เปิดหน้า Login	/login	แสดงฟอร์ม" />
                  <div class="d-flex flex-wrap align-center ga-2 mt-3">
                    <span class="text-body-2 text-muted">พบ {{ pastedRows.length }} ขั้นตอน</span>
                    <v-spacer />
                    <v-btn variant="text" size="small" :disabled="!pastedRows.length" @click="applyPaste('replace')">แทนที่ทั้งหมด</v-btn>
                    <v-btn color="primary" size="small" :disabled="!pastedRows.length" @click="applyPaste('append')">ต่อท้าย</v-btn>
                  </div>
                </v-card>
              </v-expand-transition>
              <v-card variant="flat" border>
                <v-table class="tc-steps">
                  <thead>
                    <tr>
                      <th class="text-center">#</th>
                      <th v-for="f in stepFields" :key="f.key" :class="`tc-steps__${f.key}`">{{ f.label }}</th>
                      <th v-if="!readonly" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(step, i) in form.steps" :key="step.id">
                      <td class="text-center text-muted fox-num">{{ i + 1 }}</td>
                      <td v-for="f in stepFields" :key="f.key">
                        <v-textarea
                          v-if="isEditingStep(step, f.key)"
                          v-model="step[f.key]"
                          density="compact"
                          rows="1"
                          auto-grow
                          autofocus
                          hide-details
                          :placeholder="f.placeholder"
                          :aria-label="`${f.label} ขั้นที่ ${i + 1}`"
                          @blur="stopEditingStep(step, f.key)"
                          @keydown.esc.stop="($event.target as HTMLElement).blur()"
                        />
                        <div
                          v-else
                          class="tc-step-text text-body-2"
                          :class="{ 'text-muted': !step[f.key], 'tc-step-text--editable': !readonly }"
                          :tabindex="readonly ? -1 : 0"
                          :role="readonly ? undefined : 'button'"
                          :aria-label="readonly ? undefined : `แก้ไข ${f.label} ขั้นที่ ${i + 1}`"
                          @focus="editStep(step, f.key)"
                          @click="editStep(step, f.key)"
                        >{{ step[f.key] || (readonly ? '-' : f.placeholder) }}</div>
                      </td>
                      <td v-if="!readonly" class="text-no-wrap">
                        <v-btn icon="tabler:chevron-up" variant="text" size="x-small" :disabled="i === 0" aria-label="เลื่อนขึ้น" @click="moveStep(i, -1)" />
                        <v-btn icon="tabler:chevron-down" variant="text" size="x-small" :disabled="i === form.steps.length - 1" aria-label="เลื่อนลง" @click="moveStep(i, 1)" />
                        <v-btn icon="tabler:trash" variant="text" size="x-small" color="error" :disabled="form.steps.length === 1" aria-label="ลบขั้นตอน" @click="removeStep(i)" />
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </v-card>
            </v-window-item>

            <!-- RESULTS -->
            <v-window-item value="results" eager>
              <v-row dense class="fox-form-grid">
                <v-col cols="12" sm="6">
                  <label class="fox-label" for="tc-status">สถานะผลการทดสอบ</label>
                  <v-select
                    id="tc-status"
                    v-model="form.status"
                    :items="statusOptions"
                    item-title="label"
                    item-value="value"
                  >
                    <template #item="{ props: item, item: { raw } }">
                      <v-list-item v-bind="item" :prepend-icon="raw.icon" :base-color="raw.tone" :subtitle="raw.hint" />
                    </template>
                  </v-select>
                </v-col>
                <v-col cols="12" sm="6">
                  <label class="fox-label" for="tc-cause">Root Cause</label>
                  <v-combobox id="tc-cause" v-model="form.rootCauseTag" :items="ROOT_CAUSES" placeholder="ยังไม่ได้จำแนกสาเหตุ" clearable />
                </v-col>

                <v-col cols="12" md="6">
                  <v-card variant="flat" color="light-success" class="pa-4 h-100">
                    <label class="fox-label" for="tc-expected">ผลลัพธ์ที่คาดหวัง *</label>
                    <v-textarea id="tc-expected" v-model="form.expectedResults" rows="3" auto-grow bg-color="surface" :rules="[rules.required]" />
                    <div class="fox-label mt-4">ภาพอ้างอิง (Expected)</div>
                    <FoxImageUpload v-model="form.expectedImages" :readonly="readonly" />
                  </v-card>
                </v-col>
                <v-col cols="12" md="6">
                  <v-card variant="flat" color="light-primary" class="pa-4 h-100">
                    <label class="fox-label" for="tc-actual">ผลลัพธ์จริง</label>
                    <v-textarea id="tc-actual" v-model="form.actualResults" rows="3" auto-grow bg-color="surface" placeholder="สิ่งที่เกิดขึ้นจริง ข้อผิดพลาด หรือ Response Time" />
                    <div class="fox-label mt-4">ภาพหลักฐานผลการทดสอบ (Actual)</div>
                    <FoxImageUpload v-model="form.actualImages" :readonly="readonly" />
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>

            <!-- HISTORY -->
            <v-window-item v-if="isEdit" value="history">
              <v-row class="fox-grid">
                <v-col cols="12" md="6">
                  <div class="text-overline text-muted mb-3">ประวัติเวอร์ชัน</div>
                  <TestCaseVersionTimeline :history="testCase?.versionHistory ?? []" />
                </v-col>
                <v-col cols="12" md="6">
                  <div class="text-overline text-muted mb-3">Audit Trail</div>
                  <TestCaseAuditList :case-id="form.id" :project-id="form.projectId" />
                </v-col>
              </v-row>
            </v-window-item>
          </v-window>
        </v-form>
      </v-card-text>

      <v-divider />
      <v-alert v-if="invalidatesPass" type="warning" variant="tonal" density="compact" icon="tabler:refresh-alert" class="mx-4 mt-4" rounded="lg">
        เคสนี้ผ่านการทดสอบแล้ว เมื่อบันทึกการแก้ไขข้อกำหนด ผลผ่านของ {{ testCase?.version }} จะถูกยกเลิก และสถานะกลับเป็น "พร้อมให้ทดสอบ"
      </v-alert>
      <div class="d-flex flex-wrap align-center ga-3 fox-card-body py-4">
        <span class="text-body-2 text-muted">{{ readonly ? 'บทบาทของคุณดูได้อย่างเดียว' : 'ช่องที่มี * จำเป็นต้องกรอก' }}</span>
        <v-spacer />
        <v-btn variant="outlined" @click="open = false">{{ readonly ? 'ปิด' : 'ยกเลิก' }}</v-btn>
        <v-btn v-if="!readonly" color="primary" prepend-icon="tabler:device-floppy" :loading="loading" @click="submit">
          {{ isEdit ? 'บันทึก' : 'สร้าง Test Case' }}
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.tc-steps th:first-child {
  width: 48px;
}

.tc-steps td {
  vertical-align: top;
  padding-block: 8px;
}

.tc-steps td:first-child,
.tc-steps td:last-child {
  padding-top: 14px;
}

.tc-steps__action,
.tc-steps__expectedResult {
  width: 34%;
}

.tc-steps__testData {
  width: 26%;
}

/* a step cell at rest: plain text that keeps the user's line breaks */
.tc-step-text {
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: var(--fox-radius-control);
  white-space: pre-line;
  word-break: break-word;
}

.tc-step-text--editable {
  cursor: text;
  transition: border-color 0.15s, background-color 0.15s;
}

.tc-step-text--editable:hover {
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.tc-step-text--editable:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
</style>
