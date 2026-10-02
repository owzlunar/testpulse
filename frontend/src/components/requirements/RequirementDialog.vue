<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import type { VForm } from 'vuetify/components'
import { REQUIREMENT_STATUSES, REQUIREMENT_TYPES } from '@/services/requirement.service'
import { PRIORITIES } from '@/services/test-case.service'
import type { Requirement, RequirementInput } from '@/types'
import { required } from '@/utils/validators'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(defineProps<{ requirement?: Requirement | null; projectId: string; nextCode: string; loading?: boolean }>(), {
  requirement: null,
  loading: false,
})
const emit = defineEmits<{ save: [input: RequirementInput] }>()

const formRef = ref<VForm>()
const empty = (): RequirementInput => ({
  projectId: props.projectId,
  code: props.nextCode,
  title: '',
  description: '',
  type: 'functional',
  priority: 'medium',
  status: 'draft',
  source: '',
  acceptanceCriteria: [],
})
const form = reactive<RequirementInput>(empty())
const criteriaText = ref('')
const isEdit = computed(() => !!form.id)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, empty(), props.requirement ? JSON.parse(JSON.stringify(props.requirement)) : { id: undefined })
    criteriaText.value = form.acceptanceCriteria.join('\n')
  },
  { immediate: true },
)
useUnsavedChanges(open, () => form)

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  emit('save', {
    ...form,
    acceptanceCriteria: criteriaText.value
      .split('\n')
      .map((l) => l.replace(/^[-•*\d.\s]+/, '').trim())
      .filter(Boolean),
  })
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">{{ isEdit ? `แก้ไข ${form.code}` : 'เพิ่ม Requirement' }}</h2>
          <p class="text-body-2 text-muted">ช่องที่มี * จำเป็นต้องกรอก</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <v-col cols="12" sm="4">
              <label class="fox-label" for="rq-code">รหัส *</label>
              <v-text-field id="rq-code" v-model="form.code" :rules="[required]" />
            </v-col>
            <v-col cols="12" sm="8">
              <label class="fox-label" for="rq-title">ชื่อ Requirement *</label>
              <v-text-field id="rq-title" v-model="form.title" :rules="[required]" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="rq-desc">รายละเอียด / User Story</label>
              <v-textarea id="rq-desc" v-model="form.description" rows="2" auto-grow placeholder="ในฐานะ ... ฉันต้องการ ... เพื่อ ..." />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="rq-ac">Acceptance Criteria</label>
              <v-textarea id="rq-ac" v-model="criteriaText" rows="3" auto-grow placeholder="หนึ่งบรรทัดต่อหนึ่งเงื่อนไข" />
            </v-col>
            <v-col cols="12" sm="4">
              <label class="fox-label" for="rq-type">ประเภท</label>
              <v-select id="rq-type" v-model="form.type" :items="REQUIREMENT_TYPES" item-title="label" item-value="value" />
            </v-col>
            <v-col cols="12" sm="4">
              <label class="fox-label" for="rq-priority">Priority</label>
              <v-select id="rq-priority" v-model="form.priority" :items="PRIORITIES" item-title="label" item-value="value" />
            </v-col>
            <v-col cols="12" sm="4">
              <label class="fox-label" for="rq-status">สถานะ</label>
              <v-select id="rq-status" v-model="form.status" :items="REQUIREMENT_STATUSES" item-title="label" item-value="value">
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
                </template>
              </v-select>
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="rq-source">แหล่งที่มา</label>
              <v-text-field id="rq-source" v-model="form.source" placeholder="เช่น PRD v2.1 §5.3, JIRA-1234" />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <div class="d-flex justify-end ga-3 fox-card-body pt-0">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" :loading="loading" @click="submit">บันทึก</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
