<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { VForm } from 'vuetify/components'
import FoxImageUpload from '@/components/ui/FoxImageUpload.vue'
import { DEFECT_STATUSES, SEVERITIES } from '@/services/defect.service'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import type { Defect, DefectInput } from '@/types'
import { required } from '@/utils/validators'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    /** defect to edit, or null to report a new one */
    defect?: Defect | null
    /** pre-filled fields for a new defect (e.g. from a failed step) */
    preset?: Partial<DefectInput> | null
    loading?: boolean
  }>(),
  { defect: null, preset: null, loading: false },
)
const emit = defineEmits<{ save: [input: DefectInput] }>()

const auth = useAuthStore()
const { currentProject, currentCases } = storeToRefs(useProjectStore())

const formRef = ref<VForm>()
const empty = (): DefectInput => ({
  projectId: currentProject.value?.id ?? '',
  title: '',
  description: '',
  stepsToReproduce: '',
  expected: '',
  actual: '',
  severity: 'major',
  status: 'open',
  caseId: undefined,
  runId: undefined,
  stepNumber: undefined,
  assignee: '',
  externalKey: '',
  environment: '',
  evidence: [],
})
const form = reactive<DefectInput>(empty())
const isEdit = computed(() => !!form.id)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const src = props.defect ? JSON.parse(JSON.stringify(props.defect)) : { id: undefined, ...(props.preset ?? {}) }
    Object.assign(form, empty(), src)
  },
  { immediate: true },
)

const devs = computed(() => auth.usersIn('dev').map((u) => u.name))
const caseOptions = computed(() => [
  // keep showing the link of a defect whose case was deleted until another case is picked
  ...(form.caseId && form.caseDeleted ? [{ title: `${form.caseId} (ลบแล้ว)`, value: form.caseId }] : []),
  ...currentCases.value.filter((c) => !(form.caseDeleted && c.id === form.caseId)).map((c) => ({ title: `${c.id}: ${c.name}`, value: c.id })),
])

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  const { comments: _c, reportedBy: _r, createdAt: _ca, updatedAt: _u, ...input } = form as DefectInput & Partial<Defect>
  emit('save', input)
}
</script>

<template>
  <v-dialog v-model="open" max-width="860" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">{{ isEdit ? `แก้ไข ${form.id}` : 'รายงาน Defect' }}</h2>
          <p class="text-body-2 text-muted">
            {{ form.caseId ? `จาก ${form.caseId}${form.stepNumber ? ` ขั้นตอนที่ ${form.stepNumber}` : ''}` : 'ช่องที่มี * จำเป็นต้องกรอก' }}
          </p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <v-col cols="12">
              <label class="fox-label" for="df-title">หัวข้อ *</label>
              <v-text-field
                id="df-title"
                v-model="form.title"
                placeholder="สรุปอาการสั้นๆ เช่น กดชำระเงินซ้ำแล้วตัดเงินสองครั้ง"
                :rules="[required]"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <label class="fox-label" for="df-sev">Severity *</label>
              <v-select id="df-sev" v-model="form.severity" :items="SEVERITIES" item-title="label" item-value="value">
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
                </template>
              </v-select>
            </v-col>
            <v-col cols="12" sm="4">
              <label class="fox-label" for="df-status">สถานะ</label>
              <v-select id="df-status" v-model="form.status" :items="DEFECT_STATUSES" item-title="label" item-value="value">
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
                </template>
              </v-select>
            </v-col>
            <v-col cols="12" sm="4">
              <label class="fox-label" for="df-assignee">มอบหมายให้</label>
              <v-select id="df-assignee" v-model="form.assignee" :items="devs" placeholder="ทีม Dev" prepend-inner-icon="tabler:code" clearable />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="df-case">Test Case ที่เกี่ยวข้อง</label>
              <v-autocomplete
                id="df-case"
                v-model="form.caseId"
                :items="caseOptions"
                placeholder="ไม่ระบุ"
                prepend-inner-icon="tabler:flask"
                clearable
              />
            </v-col>
            <v-col cols="6" sm="3">
              <label class="fox-label" for="df-ext">Jira / Issue key</label>
              <v-text-field id="df-ext" v-model="form.externalKey" placeholder="PAY-123" />
            </v-col>
            <v-col cols="6" sm="3">
              <label class="fox-label" for="df-env">Environment</label>
              <v-text-field id="df-env" v-model="form.environment" placeholder="Staging · v3.2.0" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="df-steps">ขั้นตอนการทำซ้ำ</label>
              <v-textarea id="df-steps" v-model="form.stepsToReproduce" rows="3" auto-grow placeholder="1. ...&#10;2. ..." />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="df-exp">ผลที่คาดหวัง</label>
              <v-textarea id="df-exp" v-model="form.expected" rows="2" auto-grow />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="df-act">ผลที่เกิดขึ้นจริง *</label>
              <v-textarea id="df-act" v-model="form.actual" rows="2" auto-grow :rules="[required]" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="df-desc">รายละเอียดเพิ่มเติม</label>
              <v-textarea id="df-desc" v-model="form.description" rows="2" auto-grow placeholder="Log, Request ID, ความถี่ที่เกิด" />
            </v-col>
            <v-col cols="12">
              <span class="fox-label">หลักฐาน</span>
              <FoxImageUpload v-model="form.evidence" />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <div class="d-flex justify-end ga-3 fox-card-body pt-0">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="error" prepend-icon="tabler:bug" :loading="loading" @click="submit">{{ isEdit ? 'บันทึก' : 'รายงาน Defect' }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
