<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { useAsyncAction } from '@/composables/useAsyncAction'
import type { VForm } from 'vuetify/components'
import { EXTEND_REASONS, isOverdue, overdueDays } from '@/services/test-case.service'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase } from '@/types'
import { addDays, formatDateTH, todayISO } from '@/utils/date'
import { required } from '@/utils/validators'

// Reschedule a due date: reason category + note are mandatory and go to the audit trail
const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    testCase: TestCase | null
    /** pre-filled new date (e.g. where the case was dropped on the calendar) */
    suggestedDate?: string | null
  }>(),
  { suggestedDate: null },
)
const emit = defineEmits<{ extended: [testCase: TestCase] }>()

const store = useTestCaseStore()
const { busy, run } = useAsyncAction()
const formRef = ref<VForm>()
const newDate = ref('')
const category = ref(EXTEND_REASONS[0])
const note = ref('')

const overdue = computed(() => (props.testCase ? isOverdue(props.testCase) : false))

watch(
  open,
  (isOpen) => {
    if (!isOpen || !props.testCase) return
    const base = props.testCase.expiryDate && props.testCase.expiryDate > todayISO() ? props.testCase.expiryDate : todayISO()
    newDate.value = props.suggestedDate ?? addDays(base, 3)
    category.value = EXTEND_REASONS[0]
    note.value = ''
  },
  { immediate: true },
)
useUnsavedChanges(open, () => [newDate.value, category.value, note.value])

const rules = {
  required,
  afterOld: (v: string) => !props.testCase?.expiryDate || v > props.testCase.expiryDate || 'ต้องอยู่หลังกำหนดเดิม',
}

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid || !props.testCase) return
  const tc = props.testCase
  await run(
    () => store.extendDueDate(tc.id, newDate.value, `${category.value} — ${note.value.trim()}`, tc.projectId),
    (updated) => {
      if (updated) emit('extended', updated)
      open.value = false
    },
  )
}
</script>

<template>
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card v-if="testCase">
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">ขอขยายเวลาส่งมอบ</h2>
          <p class="text-body-2 text-muted">การเลื่อนกำหนดจะถูกบันทึกลง Audit Trail และเพิ่มเวอร์ชัน</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <v-card-text class="fox-card-body">
        <v-card :color="overdue ? 'light-error' : 'light-primary'" variant="flat" class="pa-4 mb-6">
          <div class="d-flex align-center justify-space-between ga-2 mb-1">
            <span class="text-subtitle-2 fox-num">{{ testCase.id }}</span>
            <v-chip v-if="overdue" color="error" size="x-small" variant="flat">เลยกำหนด {{ overdueDays(testCase) }} วัน</v-chip>
          </div>
          <div class="text-body-2 text-truncate">{{ testCase.name }}</div>
        </v-card>

        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <v-col cols="12" sm="6">
              <span class="fox-label">กำหนดเดิม</span>
              <v-text-field :model-value="formatDateTH(testCase.expiryDate)" disabled prepend-inner-icon="tabler:calendar" />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="ext-date">กำหนดใหม่ *</label>
              <v-text-field
                id="ext-date"
                v-model="newDate"
                type="date"
                prepend-inner-icon="tabler:calendar-plus"
                :rules="[rules.required, rules.afterOld]"
              />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="ext-reason">สาเหตุ *</label>
              <v-select id="ext-reason" v-model="category" :items="EXTEND_REASONS" :rules="[rules.required]" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="ext-note">รายละเอียด *</label>
              <v-textarea
                id="ext-note"
                v-model="note"
                rows="3"
                auto-grow
                placeholder="เช่น PO แจ้งปรับ Requirement เรื่อง Retry Policy หรือ Sandbox ของธนาคารล่ม"
                :rules="[rules.required]"
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <div class="d-flex justify-end ga-3 fox-card-body pt-0">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:calendar-time" :loading="busy" @click="submit">บันทึกการขยายเวลา</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
