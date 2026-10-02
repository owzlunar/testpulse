<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import type { VForm } from 'vuetify/components'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useAuthStore } from '@/stores/auth.store'
import type { TestCase } from '@/types'
import { required } from '@/utils/validators'
import { templateApi } from '@/api'
import { TEMPLATE_CATEGORIES } from '@/domain/template'

// Turn an existing case into a reusable team template
const open = defineModel<boolean>({ default: false })
const props = defineProps<{ testCase: TestCase | null }>()
const emit = defineEmits<{ saved: [name: string] }>()

const auth = useAuthStore()
const formRef = ref<VForm>()
const form = reactive({ name: '', category: TEMPLATE_CATEGORIES[0], description: '' })
const { busy, run } = useAsyncAction()

watch(
  open,
  (isOpen) => {
    if (!isOpen || !props.testCase) return
    Object.assign(form, { name: props.testCase.name, category: TEMPLATE_CATEGORIES[0], description: props.testCase.testScenario })
  },
  { immediate: true },
)
useUnsavedChanges(open, () => form)

async function submit() {
  const result = await formRef.value?.validate()
  const tc = props.testCase
  if (!result?.valid || !tc) return
  await run(
    () =>
      templateApi.createTemplate({
        name: form.name,
        category: form.category,
        description: form.description,
        createdBy: auth.currentUser.name,
        draft: {
          name: tc.name,
          testScenario: tc.testScenario,
          prerequisite: tc.prerequisite,
          description: tc.description,
          priority: tc.priority,
          expectedResults: tc.expectedResults,
          steps: tc.steps.map(({ action, testData, expectedResult }) => ({ action, testData, expectedResult })),
        },
      }),
    () => {
      emit('saved', form.name)
      open.value = false
    },
  )
}
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">บันทึกเป็น Template</h2>
          <p class="text-body-2 text-muted">ทีมจะเลือกใช้ได้ตอนสร้าง Test Case ใหม่</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <v-col cols="12">
              <label class="fox-label" for="tpl-name">ชื่อ Template *</label>
              <v-text-field id="tpl-name" v-model="form.name" :rules="[required]" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="tpl-cat">หมวดหมู่</label>
              <v-combobox id="tpl-cat" v-model="form.category" :items="TEMPLATE_CATEGORIES" :rules="[required]" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="tpl-desc">คำอธิบาย</label>
              <v-textarea id="tpl-desc" v-model="form.description" rows="2" auto-grow />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <div class="d-flex justify-end ga-3 fox-card-body pt-0">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" :loading="busy" @click="submit">บันทึก Template</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
