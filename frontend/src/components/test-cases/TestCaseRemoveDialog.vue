<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase, TestCaseImpact } from '@/types'

// Confirms archiving (default) or permanently deleting a case, showing what it touches first
const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    testCase: TestCase | null
    /** archive = hide, restorable; delete = permanent (archived cases only) */
    mode?: 'archive' | 'delete'
    loading?: boolean
  }>(),
  { mode: 'archive', loading: false },
)
const emit = defineEmits<{ confirm: [] }>()

const store = useTestCaseStore()
const impact = ref<TestCaseImpact | null>(null)
const failed = ref(false)

function loadImpact() {
  impact.value = null
  failed.value = false
  const tc = props.testCase
  if (!tc) return
  store.impactOf(tc.id, tc.projectId).then(
    (result) => (impact.value = result),
    () => (failed.value = true),
  )
}

watch(open, (isOpen) => isOpen && loadImpact(), { immediate: true })

const isDelete = computed(() => props.mode === 'delete')
const subCount = computed(() => Math.max((impact.value?.caseIds.length ?? 1) - 1, 0))
const uncovered = computed(() => impact.value?.requirements.filter((r) => r.uncovered) ?? [])
const quiet = computed(() => !!impact.value && !impact.value.runs.length && !impact.value.openDefects.length && !impact.value.requirements.length)
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card v-if="testCase">
      <div class="fox-card-body pb-2">
        <div class="d-flex align-center ga-3 mb-2">
          <v-avatar :color="isDelete ? 'error' : 'secondary'" variant="tonal" size="44">
            <v-icon :icon="isDelete ? 'tabler:trash' : 'tabler:archive'" />
          </v-avatar>
          <div class="overflow-hidden">
            <h2 class="text-h5">{{ isDelete ? 'ลบถาวร' : 'เก็บเข้าคลัง' }} {{ testCase.id }}?</h2>
            <p class="text-body-2 text-muted text-truncate">{{ testCase.name }}</p>
          </div>
        </div>
        <p class="text-body-2 mb-4">
          <template v-if="isDelete">
            ลบออกจากระบบและกู้คืนไม่ได้ ผลในรอบทดสอบและ Defect จะเก็บรหัสเดิมไว้เป็นประวัติเท่านั้น
            และรหัสนี้อาจถูกใช้กับเคสใหม่ในภายหลัง
          </template>
          <template v-else>
            เคสจะถูกซ่อนจากรายการ สถิติ Coverage และการสร้างรอบทดสอบใหม่ แต่ยังคงรหัสและประวัติทั้งหมด กู้คืนได้ทุกเมื่อ
          </template>
        </p>

        <div v-if="!impact && !failed" class="d-flex align-center ga-2 text-body-2 text-muted py-2">
          <v-progress-circular indeterminate size="18" width="2" />
          กำลังตรวจสอบผลกระทบ
        </div>
        <v-alert v-else-if="failed" type="warning" variant="tonal" density="compact">ตรวจสอบผลกระทบไม่สำเร็จ</v-alert>
        <template v-else-if="impact">
          <div class="text-overline text-muted">ผลกระทบ</div>
          <ul class="remove-impact text-body-2">
            <li v-if="subCount">
              <v-icon icon="tabler:subtask" size="16" class="mr-1" />
              Sub-case {{ subCount }} รายการ ({{ impact.caseIds.slice(1).join(', ') }}) จะถูก{{ isDelete ? 'ลบ' : 'เก็บ' }}ไปด้วย
            </li>
            <li v-if="impact.runs.length">
              <v-icon icon="tabler:player-play" size="16" class="mr-1" />
              อยู่ในรอบทดสอบ {{ impact.runs.length }} รอบ:
              {{ impact.runs.map((r) => `${r.name} รอบที่ ${r.round}${r.open ? ' (ยังไม่ปิด)' : ''}`).join(', ') }}
            </li>
            <li v-if="impact.openDefects.length" class="text-error">
              <v-icon icon="tabler:bug" size="16" class="mr-1" />
              มี Defect ที่ยังเปิด {{ impact.openDefects.length }} รายการ: {{ impact.openDefects.map((d) => d.id).join(', ') }}
            </li>
            <li v-if="impact.requirements.length">
              <v-icon icon="tabler:link" size="16" class="mr-1" />
              ผูกกับ Requirement {{ impact.requirements.map((r) => r.code).join(', ') }}
            </li>
            <li v-if="uncovered.length" class="text-warning">
              <v-icon icon="tabler:alert-triangle" size="16" class="mr-1" />
              {{ uncovered.map((r) => r.code).join(', ') }} จะไม่เหลือ Test Case ครอบคลุม
            </li>
            <li v-if="quiet" class="text-muted">ไม่มีรอบทดสอบ Defect หรือ Requirement ที่อ้างถึงเคสนี้</li>
          </ul>
        </template>
      </div>
      <div class="d-flex justify-end ga-3 fox-card-body pt-2">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn
          :color="isDelete ? 'error' : 'primary'"
          :prepend-icon="isDelete ? 'tabler:trash' : 'tabler:archive'"
          :loading="loading"
          :disabled="!impact && !failed"
          @click="emit('confirm')"
        >
          {{ isDelete ? 'ลบถาวร' : 'เก็บเข้าคลัง' }}
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.remove-impact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}
</style>
