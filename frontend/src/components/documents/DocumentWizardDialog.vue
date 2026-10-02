<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { storeToRefs } from 'pinia'
import type { VForm } from 'vuetify/components'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useAuthStore } from '@/stores/auth.store'
import { useDefectStore } from '@/stores/defect.store'
import { useDocumentStore } from '@/stores/document.store'
import { useProjectStore } from '@/stores/project.store'
import { useRunStore } from '@/stores/run.store'
import type { DocumentOptions, DocumentRecord, DocumentType, Signatory, UatDetails } from '@/types'
import { formatDateTH } from '@/utils/date'
import { required } from '@/utils/validators'
import { isOpenDefect } from '@/domain/defect'
import { DOCUMENT_TYPES, UAT_DECISIONS, documentTypeOf, formatDocNumber } from '@/domain/document'
import { runCounts } from '@/domain/run'
import { isOverdue } from '@/domain/test-case'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(defineProps<{ type?: DocumentType | null; runId?: string | null }>(), { type: null, runId: null })
const emit = defineEmits<{ generated: [doc: DocumentRecord] }>()

const docStore = useDocumentStore()
const runStore = useRunStore()
const defectStore = useDefectStore()
const { currentProject, currentCases } = storeToRefs(useProjectStore())
const { users, currentUser } = storeToRefs(useAuthStore())
const { busy, run } = useAsyncAction()

const formRef = ref<VForm>()
const step = ref(1)
/** the type being built (the `type` prop only picks the starting one) */
const docType = ref<DocumentType>('uat')
const title = ref('')
const docNumber = ref('')
const options = reactive<DocumentOptions>({
  runId: undefined,
  includeSubCases: true,
  includeSteps: true,
  includeEvidence: true,
  includeDefects: true,
  includeTraceability: false,
})
const uat = reactive<UatDetails>({ testPeriod: '', environment: '', decision: 'accepted', remarks: '', riskAcknowledged: false })
const signatories = ref<Signatory[]>([])

// --- defaults per type ---------------------------------------------------------------------
const runOptions = computed(() =>
  runStore.current.map((r) => ({ title: `${r.name} · รอบที่ ${r.round} (${r.status === 'completed' ? 'ปิดแล้ว' : 'กำลังทดสอบ'})`, value: r.id })),
)
const selectedRun = computed(() => runStore.current.find((r) => r.id === options.runId))

function applyType(t: DocumentType) {
  docType.value = t
  const key = currentProject.value?.key ?? 'PRJ'
  const runDefault = props.runId ?? (t === 'test_spec' || t === 'rtm' ? undefined : runStore.current[0]?.id)
  Object.assign(options, {
    runId: runDefault,
    includeSubCases: true,
    includeSteps: t !== 'rtm',
    includeEvidence: t !== 'test_spec' && t !== 'rtm',
    includeDefects: t === 'uat' || t === 'test_summary',
    includeTraceability: t === 'rtm' || t === 'uat',
  })
  docNumber.value = formatDocNumber(docStore.template.docNumberPattern, t, key, docStore.nextSeq(t))
  updateTitle()
}

function updateTitle() {
  const name = currentProject.value?.name ?? ''
  const r = selectedRun.value
  title.value =
    docType.value === 'uat'
      ? `เอกสารตรวจรับระบบ (UAT Sign-off) ${name}`
      : docType.value === 'test_summary'
        ? `รายงานผลการทดสอบ ${r ? `${r.name} รอบที่ ${r.round}` : name}`
        : docType.value === 'test_spec'
          ? `เอกสารกรณีทดสอบ (Test Specification) ${name}`
          : `Requirement Traceability Matrix ${name}`
  if (r) {
    uat.testPeriod = `${formatDateTH(r.plannedStart)} – ${formatDateTH(r.plannedEnd)}`
    uat.environment = [r.environment, r.build].filter(Boolean).join(' · ')
  }
}

// the defaults below are the saved state: they load asynchronously, so mark them clean once filled
const { markClean } = useUnsavedChanges(open, () => [docType.value, title.value, docNumber.value, options, uat, signatories.value])
watch(
  open,
  async (isOpen) => {
    if (!isOpen) return
    step.value = props.type ? 2 : 1
    await run(() => Promise.all([docStore.ensureLoaded(), runStore.ensureLoaded(), defectStore.ensureLoaded()]))
    applyType(props.type ?? 'uat')
    // the gatekeeper forces a conditional decision while risks are open
    Object.assign(uat, { decision: atRisk.value ? 'conditional' : 'accepted', remarks: '', riskAcknowledged: false })
    signatories.value = docStore.template.defaultSignatories.map((s, i) => ({
      ...s,
      name: i === 0 ? currentUser.value.name : '',
      status: 'pending',
    }))
    markClean()
  },
  { immediate: true },
)
watch(() => options.runId, updateTitle)

// --- release gatekeeper (UAT) ------------------------------------------------------------------
const risks = computed(() => {
  const r = selectedRun.value
  const failed = r ? runCounts(r).failed : currentCases.value.filter((c) => c.status === 'failed').length
  const blocked = r ? runCounts(r).blocked : currentCases.value.filter((c) => c.status === 'blocked').length
  const overdue = currentCases.value.filter(isOverdue).length
  const openDefects = defectStore.current.filter(isOpenDefect).length
  return [
    failed && `Failed ${failed} เคส`,
    blocked && `Blocked ${blocked} เคส`,
    overdue && `เลยกำหนด ${overdue} เคส`,
    openDefects && `Defect เปิดอยู่ ${openDefects} รายการ`,
  ].filter(Boolean) as string[]
})
const atRisk = computed(() => docType.value === 'uat' && risks.value.length > 0)
watch(atRisk, (risky) => risky && uat.decision === 'accepted' && (uat.decision = 'conditional'), { immediate: true })

const signerNames = computed(() => users.value.map((u) => u.name))

function addSigner() {
  signatories.value.push({ role: 'ผู้ลงนาม', position: '', name: '', status: 'pending' })
}

async function generate() {
  const result = await formRef.value?.validate()
  if (!result?.valid || !currentProject.value || (atRisk.value && !uat.riskAcknowledged)) {
    if (!result?.valid) step.value = 2
    return
  }
  run(
    () =>
      docStore.generate({
        projectId: currentProject.value!.id,
        type: docType.value,
        title: title.value,
        docNumber: docNumber.value,
        options: { ...options },
        uat: docType.value === 'uat' ? { ...uat } : undefined,
        signatories: signatories.value.filter((s) => s.role || s.name),
      }),
    (doc) => {
      emit('generated', doc)
      open.value = false
    },
  )
}

const steps = ['ประเภทเอกสาร', 'เนื้อหา', 'ผู้ลงนาม']
</script>

<template>
  <v-dialog v-model="open" max-width="920" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">สร้างเอกสาร</h2>
          <p class="text-body-2 text-muted">ระบบรวบรวมข้อมูลจาก Test Case รอบทดสอบ Defect และ Requirement ให้อัตโนมัติ</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <div class="wiz-steps fox-card-body pb-2">
        <button
          v-for="(label, i) in steps"
          :key="label"
          type="button"
          class="wiz-step"
          :class="{ 'wiz-step--on': step >= i + 1 }"
          @click="step = i + 1"
        >
          <v-avatar :color="step >= i + 1 ? 'primary' : 'secondary'" :variant="step > i + 1 ? 'flat' : 'tonal'" size="28">
            <v-icon v-if="step > i + 1" icon="tabler:check" size="16" />
            <span v-else class="text-caption">{{ i + 1 }}</span>
          </v-avatar>
          <span class="text-subtitle-2">{{ label }}</span>
        </button>
      </div>
      <v-divider />

      <v-card-text class="fox-card-body wiz-body">
        <v-form ref="formRef" @submit.prevent>
          <v-window v-model="step">
            <!-- 1. type -->
            <v-window-item :value="1">
              <div class="wiz-types">
                <v-card
                  v-for="t in DOCUMENT_TYPES"
                  :key="t.value"
                  variant="flat"
                  border
                  class="pa-5 wiz-type"
                  :class="{ 'wiz-type--on': docType === t.value }"
                  role="radio"
                  :aria-checked="docType === t.value"
                  @click="applyType(t.value)"
                >
                  <div class="d-flex align-center ga-3 mb-2">
                    <v-avatar :color="t.tone" rounded="lg" size="44"><v-icon :icon="t.icon" size="22" /></v-avatar>
                    <div>
                      <div class="text-h6">{{ t.label }}</div>
                      <div class="text-caption text-muted">{{ t.hint }}</div>
                    </div>
                  </div>
                  <p class="text-body-2 text-muted mb-0">{{ t.description }}</p>
                </v-card>
              </div>
            </v-window-item>

            <!-- 2. content -->
            <v-window-item :value="2" eager>
              <v-row dense class="fox-form-grid">
                <v-col cols="12" sm="8">
                  <label class="fox-label" for="doc-title">ชื่อเอกสาร *</label>
                  <v-text-field id="doc-title" v-model="title" :rules="[required]" />
                </v-col>
                <v-col cols="12" sm="4">
                  <label class="fox-label" for="doc-no">เลขที่เอกสาร *</label>
                  <v-text-field id="doc-no" v-model="docNumber" :rules="[required]" />
                </v-col>
                <v-col v-if="docType !== 'rtm'" cols="12">
                  <label class="fox-label" for="doc-run">ข้อมูลผลทดสอบจาก</label>
                  <v-select
                    id="doc-run"
                    v-model="options.runId"
                    :items="[{ title: 'สถานะล่าสุดของ Test Case ทั้งโปรเจกต์ (ไม่อ้างอิงรอบ)', value: undefined }, ...runOptions]"
                    prepend-inner-icon="tabler:player-play"
                  />
                </v-col>

                <v-col cols="12">
                  <span class="fox-label">เนื้อหาที่รวมในเอกสาร</span>
                  <div class="wiz-options">
                    <v-checkbox v-model="options.includeSteps" :disabled="docType === 'rtm'" label="ตารางขั้นตอนทดสอบ" />
                    <v-checkbox v-model="options.includeEvidence" label="ภาพหลักฐาน" />
                    <v-checkbox v-model="options.includeDefects" label="รายการ Defect" />
                    <v-checkbox v-model="options.includeTraceability" :disabled="docType === 'rtm'" label="Traceability Matrix" />
                    <v-checkbox v-model="options.includeSubCases" label="รวม Sub-case" />
                  </div>
                </v-col>

                <template v-if="docType === 'uat'">
                  <v-col cols="12"><v-divider /></v-col>
                  <v-col cols="12" sm="6">
                    <label class="fox-label" for="doc-period">ช่วงเวลาตรวจรับ *</label>
                    <v-text-field id="doc-period" v-model="uat.testPeriod" prepend-inner-icon="tabler:calendar" :rules="[required]" />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <label class="fox-label" for="doc-env">Environment *</label>
                    <v-text-field id="doc-env" v-model="uat.environment" prepend-inner-icon="tabler:server" :rules="[required]" />
                  </v-col>
                  <v-col v-if="atRisk" cols="12">
                    <v-alert type="error" variant="tonal" icon="tabler:shield-exclamation" title="Release at Risk">
                      <p class="text-body-2 mb-2">
                        พบ {{ risks.join(' · ') }} — มติ "ผ่านการตรวจรับสมบูรณ์" จะเลือกไม่ได้ และเอกสารจะระบุความเสี่ยงไว้
                      </p>
                      <v-checkbox v-model="uat.riskAcknowledged" color="error" label="รับทราบความเสี่ยงของ Release นี้" />
                    </v-alert>
                  </v-col>
                  <v-col cols="12">
                    <span class="fox-label">มติการตรวจรับ</span>
                    <v-radio-group v-model="uat.decision">
                      <v-radio
                        v-for="d in UAT_DECISIONS"
                        :key="d.value"
                        :value="d.value"
                        :color="d.tone"
                        :label="d.full"
                        :disabled="atRisk && d.value === 'accepted'"
                      />
                    </v-radio-group>
                  </v-col>
                  <v-col cols="12">
                    <label class="fox-label" for="doc-remarks">ข้อคิดเห็นและข้อตกลง</label>
                    <v-textarea
                      id="doc-remarks"
                      v-model="uat.remarks"
                      rows="2"
                      auto-grow
                      placeholder="เช่น Defect ระดับ Minor จะแก้ไขในสปรินต์ถัดไป ภายในวันที่ ..."
                    />
                  </v-col>
                </template>
              </v-row>
            </v-window-item>

            <!-- 3. signatories -->
            <v-window-item :value="3">
              <p class="text-body-2 text-muted mb-4">ค่าเริ่มต้นมาจาก "แม่แบบเอกสาร" ในหน้าตั้งค่า เว้นชื่อว่างได้หากจะลงนามด้วยมือ</p>
              <div class="d-flex flex-column ga-3">
                <v-row v-for="(sg, i) in signatories" :key="i" dense class="align-center">
                  <v-col cols="12" sm="4">
                    <v-text-field v-model="sg.role" density="compact" :aria-label="`บทบาทผู้ลงนาม ${i + 1}`" placeholder="บทบาท" />
                  </v-col>
                  <v-col cols="12" sm="4">
                    <v-combobox
                      v-model="sg.name"
                      :items="signerNames"
                      density="compact"
                      :aria-label="`ชื่อผู้ลงนาม ${i + 1}`"
                      placeholder="ชื่อ-นามสกุล"
                    />
                  </v-col>
                  <v-col cols="10" sm="3">
                    <v-text-field v-model="sg.position" density="compact" :aria-label="`ตำแหน่ง ${i + 1}`" placeholder="ตำแหน่ง" />
                  </v-col>
                  <v-col cols="2" sm="1" class="text-end">
                    <v-btn
                      icon="tabler:trash"
                      variant="text"
                      size="small"
                      color="error"
                      :aria-label="`ลบผู้ลงนาม ${i + 1}`"
                      @click="signatories.splice(i, 1)"
                    />
                  </v-col>
                </v-row>
              </div>
              <v-btn class="mt-3" variant="tonal" color="primary" size="small" prepend-icon="tabler:plus" @click="addSigner">เพิ่มผู้ลงนาม</v-btn>
            </v-window-item>
          </v-window>
        </v-form>
      </v-card-text>

      <v-divider />
      <div class="d-flex align-center ga-3 fox-card-body py-4">
        <v-btn v-if="step > 1" variant="text" prepend-icon="tabler:chevron-left" @click="step--">ย้อนกลับ</v-btn>
        <span v-else class="text-body-2 text-muted">{{ documentTypeOf(docType).label }}</span>
        <v-spacer />
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn v-if="step < 3" color="primary" append-icon="tabler:chevron-right" @click="step++">ถัดไป</v-btn>
        <v-btn
          v-else
          color="primary"
          prepend-icon="tabler:file-certificate"
          :loading="busy"
          :disabled="atRisk && !uat.riskAcknowledged"
          @click="generate"
        >
          สร้างเอกสาร
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.wiz-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.wiz-step {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(var(--v-theme-muted));
}

.wiz-step--on {
  color: rgb(var(--v-theme-on-surface));
}

.wiz-body {
  min-height: 380px;
}

.wiz-types {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.wiz-type {
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: -2px;
  transition:
    outline-color 0.15s,
    background-color 0.15s;
}

.wiz-type--on {
  outline-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.04);
}

.wiz-options {
  display: flex;
  flex-wrap: wrap;
  column-gap: 24px;
}
</style>
