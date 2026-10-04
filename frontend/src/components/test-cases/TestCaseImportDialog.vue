<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxImportMapping from '@/components/ui/FoxImportMapping.vue'
import FoxImportSource from '@/components/ui/FoxImportSource.vue'
import FoxSteps from '@/components/ui/FoxSteps.vue'
import TestCasePriorityChip from './TestCasePriorityChip.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useTableImport, type ImportField } from '@/composables/useTableImport'
import { useProjectStore } from '@/stores/project.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCaseDraft } from '@/types'
import { priorityFromText } from '@/domain/test-case'

// Import test cases from Excel (copy & paste) or CSV.
// One row per step; rows with an empty case name continue the case above.
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ imported: [count: number] }>()

const { currentProject } = storeToRefs(useProjectStore())
const store = useTestCaseStore()
const { busy, run } = useAsyncAction()

type Field = 'name' | 'requirement' | 'testScenario' | 'prerequisite' | 'priority' | 'action' | 'testData' | 'stepExpected' | 'expectedResults'
const FIELDS: ImportField<Field>[] = [
  { key: 'name', label: 'ชื่อ Test Case', required: true, aliases: ['name', 'test case', 'title', 'ชื่อ', 'test case name'] },
  { key: 'requirement', label: 'Requirement', aliases: ['requirement', 'req', 'user story', 'ข้อกำหนด'] },
  { key: 'testScenario', label: 'Test Scenario', aliases: ['scenario', 'test scenario', 'สถานการณ์'] },
  { key: 'prerequisite', label: 'Prerequisite', aliases: ['prerequisite', 'precondition', 'pre-condition', 'เงื่อนไข'] },
  { key: 'priority', label: 'Priority', aliases: ['priority', 'ความสำคัญ', 'severity'] },
  { key: 'action', label: 'ขั้นตอน (Action)', required: true, aliases: ['action', 'step', 'steps', 'test step', 'ขั้นตอน'] },
  { key: 'testData', label: 'Test Data', aliases: ['test data', 'data', 'ข้อมูลทดสอบ'] },
  { key: 'stepExpected', label: 'Expected (รายขั้นตอน)', aliases: ['expected', 'expected result', 'ผลที่คาดหวัง'] },
  { key: 'expectedResults', label: 'Expected (ทั้งเคส)', aliases: ['expected results', 'overall expected', 'ผลลัพธ์ที่คาดหวัง'] },
]

const SAMPLE = [
  ['Test Case', 'Requirement', 'Scenario', 'Prerequisite', 'Priority', 'Action', 'Test Data', 'Expected', 'Expected Results'],
  [
    'ค้นหาสินค้าด้วยชื่อ',
    'REQ-SHOP-10: ค้นหาสินค้า',
    'ค้นหาด้วยคำที่มีอยู่',
    'มีสินค้าในระบบ',
    'High',
    'พิมพ์คำค้นในช่องค้นหา',
    'iPhone',
    'แสดงรายการที่ตรง',
    'ผลลัพธ์ถูกต้องภายใน 1 วินาที',
  ],
  ['', '', '', '', '', 'กดตัวกรองราคา', '10,000–20,000', 'กรองตามช่วงราคา', ''],
  [
    'ค้นหาไม่พบสินค้า',
    'REQ-SHOP-10: ค้นหาสินค้า',
    'ค้นหาด้วยคำที่ไม่มี',
    '-',
    'Medium',
    'พิมพ์คำที่ไม่มีอยู่',
    'zzzz',
    'แสดง Empty state',
    'แนะนำคำค้นอื่น',
  ],
]

// --- step 1: source · step 2: mapping (useTableImport) ---------------------------------
const step = ref(1)
const { source, text, fileName, hasHeader, reset, onFile, header, body, rowNumber, mapping, autoMap, columnOptions, cell, sample, mappingValid } =
  useTableImport(FIELDS)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    step.value = 1
    reset()
  },
  { immediate: true },
)

// --- step 3: preview ----------------------------------------------------------------

interface Parsed extends TestCaseDraft {
  row: number
  errors: string[]
}

const parsed = computed<Parsed[]>(() => {
  const out: Parsed[] = []
  body.value.forEach((r, i) => {
    const name = cell(r, 'name')
    const stepRow = { action: cell(r, 'action'), testData: cell(r, 'testData'), expectedResult: cell(r, 'stepExpected') }
    if (!name && out.length) {
      if (stepRow.action) out.at(-1)!.steps.push(stepRow)
      return
    }
    out.push({
      row: rowNumber(i),
      name,
      requirement: cell(r, 'requirement'),
      testScenario: cell(r, 'testScenario') || name,
      prerequisite: cell(r, 'prerequisite'),
      priority: priorityFromText(cell(r, 'priority')),
      expectedResults: cell(r, 'expectedResults') || stepRow.expectedResult,
      steps: stepRow.action ? [stepRow] : [],
      errors: [],
    })
  })
  out.forEach((c) => {
    if (!c.name) c.errors.push('ไม่มีชื่อ Test Case')
    if (!c.steps.length) c.errors.push('ไม่มีขั้นตอน')
    if (!c.expectedResults) c.errors.push('ไม่มี Expected Result')
  })
  return out
})

const valid = computed(() => parsed.value.filter((c) => !c.errors.length))
const invalid = computed(() => parsed.value.filter((c) => c.errors.length))

function next() {
  if (step.value === 1) autoMap()
  step.value++
}

function submit() {
  const project = currentProject.value
  if (!project || !valid.value.length) return
  const drafts = valid.value.map(({ row: _row, errors: _errors, ...d }) => d)
  run(
    () => store.createMany(project.id, drafts, 'นำเข้า'),
    (saved) => {
      emit('imported', saved.length)
      open.value = false
    },
  )
}

const steps = ['แหล่งข้อมูล', 'จับคู่คอลัมน์', 'ตรวจสอบและนำเข้า']
</script>

<template>
  <v-dialog v-model="open" max-width="980" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">นำเข้า Test Case</h2>
          <p class="text-body-2 text-muted">จาก Excel, Google Sheets หรือไฟล์ CSV เข้าโปรเจกต์ {{ currentProject?.name }}</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <FoxSteps :steps="steps" :step="step" class="fox-card-body pb-2" />
      <v-divider />

      <v-card-text class="fox-card-body imp-body">
        <v-window v-model="step">
          <!-- 1. source -->
          <v-window-item :value="1">
            <FoxImportSource
              v-model:source="source"
              v-model:text="text"
              v-model:has-header="hasHeader"
              :file-name="fileName"
              :rows="body.length"
              :columns="header.length"
              :template="{ name: 'testpulse-import-template.csv', rows: SAMPLE }"
              placeholder="Test Case	Requirement	Scenario	…"
              @file="onFile"
            >
              <v-alert type="info" variant="tonal" density="compact" icon="tabler:info-circle" class="mt-2">
                หนึ่งแถวต่อหนึ่งขั้นตอน — ถ้าเว้นชื่อ Test Case ว่าง แถวนั้นจะเป็นขั้นตอนถัดไปของเคสด้านบน
              </v-alert>
            </FoxImportSource>
          </v-window-item>

          <!-- 2. mapping -->
          <v-window-item :value="2">
            <FoxImportMapping v-model="mapping" :fields="FIELDS" :columns="columnOptions" :sample="sample" />
          </v-window-item>

          <!-- 3. preview -->
          <v-window-item :value="3">
            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-chip color="success" variant="tonal" prepend-icon="tabler:circle-check">พร้อมนำเข้า {{ valid.length }} เคส</v-chip>
              <v-chip v-if="invalid.length" color="error" variant="tonal" prepend-icon="tabler:alert-circle"
                >ข้าม {{ invalid.length }} เคสที่ข้อมูลไม่ครบ</v-chip
              >
              <v-chip variant="tonal" prepend-icon="tabler:list-numbers"> รวม {{ valid.reduce((n, c) => n + c.steps.length, 0) }} ขั้นตอน </v-chip>
            </div>
            <v-expansion-panels v-if="parsed.length" variant="accordion">
              <v-expansion-panel v-for="c in parsed" :key="c.row">
                <v-expansion-panel-title>
                  <div class="d-flex align-center ga-3 w-100 overflow-hidden">
                    <v-icon :icon="c.errors.length ? 'tabler:alert-circle' : 'tabler:circle-check'" :color="c.errors.length ? 'error' : 'success'" />
                    <span class="text-subtitle-2 text-truncate flex-grow-1">{{ c.name || '(ไม่มีชื่อ)' }}</span>
                    <TestCasePriorityChip :priority="c.priority" />
                    <span class="text-caption text-muted text-no-wrap">แถว {{ c.row }} · {{ c.steps.length }} ขั้นตอน</span>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-alert v-if="c.errors.length" type="error" variant="tonal" density="compact" class="mb-3">{{ c.errors.join(' · ') }}</v-alert>
                  <div class="text-body-2 mb-2"><span class="text-muted">Requirement:</span> {{ c.requirement || '—' }}</div>
                  <ol class="text-body-2 pl-5">
                    <li v-for="(st, i) in c.steps" :key="i">
                      {{ st.action }} <span class="text-muted">· {{ st.testData }}</span> → {{ st.expectedResult }}
                    </li>
                  </ol>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
            <FoxEmptyState v-else icon="tabler:table-off" title="ไม่พบข้อมูลที่นำเข้าได้" text="กลับไปตรวจสอบการจับคู่คอลัมน์" />
          </v-window-item>
        </v-window>
      </v-card-text>

      <v-divider />
      <div class="d-flex align-center ga-3 fox-card-body py-4">
        <v-btn v-if="step > 1" variant="text" prepend-icon="tabler:chevron-left" @click="step--">ย้อนกลับ</v-btn>
        <v-spacer />
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn v-if="step === 1" color="primary" append-icon="tabler:chevron-right" :disabled="!body.length" @click="next">ถัดไป</v-btn>
        <v-btn v-else-if="step === 2" color="primary" append-icon="tabler:chevron-right" :disabled="!mappingValid" @click="next">ตรวจสอบ</v-btn>
        <v-btn v-else color="primary" prepend-icon="tabler:file-import" :loading="busy" :disabled="!valid.length" @click="submit">
          นำเข้า {{ valid.length }} เคส
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.imp-body {
  min-height: 380px;
}
</style>
