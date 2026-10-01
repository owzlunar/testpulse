<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import TestCasePriorityChip from './TestCasePriorityChip.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useProjectStore } from '@/stores/project.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCaseDraft, TestCasePriority } from '@/types'
import { downloadText, parseDelimited, toCsv } from '@/utils/table'

// Import test cases from Excel (copy & paste) or CSV.
// One row per step; rows with an empty case name continue the case above.
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ imported: [count: number] }>()

const { currentProject } = storeToRefs(useProjectStore())
const store = useTestCaseStore()
const { busy, run } = useAsyncAction()

type Field = 'name' | 'requirement' | 'testScenario' | 'prerequisite' | 'priority' | 'action' | 'testData' | 'stepExpected' | 'expectedResults'
const FIELDS: { key: Field; label: string; required?: boolean; aliases: string[] }[] = [
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
  ['ค้นหาสินค้าด้วยชื่อ', 'REQ-SHOP-10: ค้นหาสินค้า', 'ค้นหาด้วยคำที่มีอยู่', 'มีสินค้าในระบบ', 'High', 'พิมพ์คำค้นในช่องค้นหา', 'iPhone', 'แสดงรายการที่ตรง', 'ผลลัพธ์ถูกต้องภายใน 1 วินาที'],
  ['', '', '', '', '', 'กดตัวกรองราคา', '10,000–20,000', 'กรองตามช่วงราคา', ''],
  ['ค้นหาไม่พบสินค้า', 'REQ-SHOP-10: ค้นหาสินค้า', 'ค้นหาด้วยคำที่ไม่มี', '-', 'Medium', 'พิมพ์คำที่ไม่มีอยู่', 'zzzz', 'แสดง Empty state', 'แนะนำคำค้นอื่น'],
]

// --- step 1: source --------------------------------------------------------------
const step = ref(1)
const source = ref<'paste' | 'file'>('paste')
const text = ref('')
const fileName = ref('')
const hasHeader = ref(true)

watch(open, (isOpen) => {
  if (!isOpen) return
  step.value = 1
  text.value = ''
  fileName.value = ''
}, { immediate: true })

function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileName.value = file.name
  file.text().then((t) => (text.value = t))
}

const rows = computed(() => parseDelimited(text.value))
const header = computed(() => (hasHeader.value ? rows.value[0] ?? [] : (rows.value[0] ?? []).map((_, i) => `คอลัมน์ ${i + 1}`)))
const body = computed(() => (hasHeader.value ? rows.value.slice(1) : rows.value))

// --- step 2: mapping ----------------------------------------------------------------
const mapping = ref<Record<Field, number | null>>({} as Record<Field, number | null>)

function autoMap() {
  const names = header.value.map((h) => h.toLowerCase().trim())
  mapping.value = Object.fromEntries(
    FIELDS.map((f, i) => {
      const exact = names.findIndex((n) => f.aliases.includes(n))
      // headerless data: assume the sample column order
      return [f.key, exact >= 0 ? exact : !hasHeader.value && i < names.length ? i : null]
    }),
  ) as Record<Field, number | null>
}

const columnOptions = computed(() => header.value.map((h, i) => ({ title: h || `คอลัมน์ ${i + 1}`, value: i })))
const sample = (field: Field) => {
  const col = mapping.value[field]
  return col === null || col === undefined ? '' : body.value.find((r) => r[col])?.[col] ?? ''
}
const mappingValid = computed(() => FIELDS.filter((f) => f.required).every((f) => mapping.value[f.key] !== null && mapping.value[f.key] !== undefined))

// --- step 3: preview ----------------------------------------------------------------
function toPriority(v: string): TestCasePriority {
  const s = v.toLowerCase()
  if (/crit|วิกฤต|p1|blocker/.test(s)) return 'critical'
  if (/high|สูง|p2|major/.test(s)) return 'high'
  if (/low|ต่ำ|p4|trivial/.test(s)) return 'low'
  return 'medium'
}

interface Parsed extends TestCaseDraft {
  row: number
  errors: string[]
}

const parsed = computed<Parsed[]>(() => {
  const cell = (r: string[], f: Field) => {
    const col = mapping.value[f]
    return col === null || col === undefined ? '' : r[col] ?? ''
  }
  const out: Parsed[] = []
  body.value.forEach((r, i) => {
    const name = cell(r, 'name')
    const stepRow = { action: cell(r, 'action'), testData: cell(r, 'testData'), expectedResult: cell(r, 'stepExpected') }
    if (!name && out.length) {
      if (stepRow.action) out.at(-1)!.steps.push(stepRow)
      return
    }
    out.push({
      row: i + (hasHeader.value ? 2 : 1),
      name,
      requirement: cell(r, 'requirement'),
      testScenario: cell(r, 'testScenario') || name,
      prerequisite: cell(r, 'prerequisite'),
      priority: toPriority(cell(r, 'priority')),
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

      <!-- stepper -->
      <div class="imp-steps fox-card-body pb-2">
        <div v-for="(label, i) in steps" :key="label" class="imp-step" :class="{ 'imp-step--done': step > i + 1, 'imp-step--active': step === i + 1 }">
          <v-avatar :color="step >= i + 1 ? 'primary' : 'secondary'" :variant="step > i + 1 ? 'flat' : 'tonal'" size="28">
            <v-icon v-if="step > i + 1" icon="tabler:check" size="16" />
            <span v-else class="text-caption fox-num">{{ i + 1 }}</span>
          </v-avatar>
          <span class="text-subtitle-2">{{ label }}</span>
        </div>
      </div>
      <v-divider />

      <v-card-text class="fox-card-body imp-body">
        <v-window v-model="step">
          <!-- 1. source -->
          <v-window-item :value="1">
            <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
              <v-btn-toggle v-model="source" mandatory color="primary" variant="outlined" density="comfortable">
                <v-btn value="paste" prepend-icon="tabler:clipboard-text">วางจาก Excel</v-btn>
                <v-btn value="file" prepend-icon="tabler:file-upload">อัปโหลด CSV</v-btn>
              </v-btn-toggle>
              <v-btn variant="text" color="primary" prepend-icon="tabler:download" @click="downloadText('testpulse-import-template.csv', toCsv(SAMPLE))">
                ดาวน์โหลดไฟล์ตัวอย่าง
              </v-btn>
            </div>

            <template v-if="source === 'paste'">
              <label class="fox-label" for="imp-paste">เลือกช่วงตารางใน Excel แล้วคัดลอก (Ctrl/⌘ + C) มาวางที่นี่</label>
              <v-textarea id="imp-paste" v-model="text" rows="8" placeholder="Test Case	Requirement	Scenario	…" />
            </template>
            <template v-else>
              <label class="fox-label" for="imp-file">ไฟล์ CSV (UTF-8)</label>
              <v-file-input id="imp-file" accept=".csv,text/csv" prepend-icon="" prepend-inner-icon="tabler:file-spreadsheet" :label="fileName || 'เลือกไฟล์'" @change="onFile" />
              <p class="text-caption text-muted mt-2">ไฟล์ .xlsx ให้ "บันทึกเป็น CSV UTF-8" ก่อน หรือใช้วิธีคัดลอกวาง</p>
            </template>

            <v-checkbox v-model="hasHeader" label="แถวแรกเป็นหัวตาราง" class="mt-2" />

            <v-alert type="info" variant="tonal" density="compact" icon="tabler:info-circle" class="mt-2">
              หนึ่งแถวต่อหนึ่งขั้นตอน — ถ้าเว้นชื่อ Test Case ว่าง แถวนั้นจะเป็นขั้นตอนถัดไปของเคสด้านบน
            </v-alert>
            <p v-if="text" class="text-body-2 text-muted mt-3 mb-0">อ่านได้ {{ body.length }} แถว · {{ header.length }} คอลัมน์</p>
          </v-window-item>

          <!-- 2. mapping -->
          <v-window-item :value="2">
            <p class="text-body-2 text-muted mb-4">ระบบจับคู่คอลัมน์ให้อัตโนมัติจากชื่อหัวตาราง ตรวจสอบและแก้ไขได้</p>
            <v-table>
              <thead>
                <tr>
                  <th>ข้อมูลใน TestPulse</th>
                  <th>คอลัมน์จากไฟล์</th>
                  <th>ตัวอย่างข้อมูล</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in FIELDS" :key="f.key">
                  <td class="text-subtitle-2 text-no-wrap">{{ f.label }}<span v-if="f.required" class="text-error"> *</span></td>
                  <td class="imp-map">
                    <v-select v-model="mapping[f.key]" :items="columnOptions" density="compact" placeholder="— ไม่นำเข้า —" clearable :aria-label="f.label" />
                  </td>
                  <td class="text-body-2 text-muted"><span class="fox-clamp-2">{{ sample(f.key) || '—' }}</span></td>
                </tr>
              </tbody>
            </v-table>
          </v-window-item>

          <!-- 3. preview -->
          <v-window-item :value="3">
            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-chip color="success" variant="tonal" prepend-icon="tabler:circle-check">พร้อมนำเข้า {{ valid.length }} เคส</v-chip>
              <v-chip v-if="invalid.length" color="error" variant="tonal" prepend-icon="tabler:alert-circle">ข้าม {{ invalid.length }} เคสที่ข้อมูลไม่ครบ</v-chip>
              <v-chip variant="tonal" prepend-icon="tabler:list-numbers">
                รวม {{ valid.reduce((n, c) => n + c.steps.length, 0) }} ขั้นตอน
              </v-chip>
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
                    <li v-for="(st, i) in c.steps" :key="i">{{ st.action }} <span class="text-muted">· {{ st.testData }}</span> → {{ st.expectedResult }}</li>
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
.imp-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.imp-step {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(var(--v-theme-muted));
}

.imp-step--active,
.imp-step--done {
  color: rgb(var(--v-theme-on-surface));
}

.imp-body {
  min-height: 380px;
}

.imp-map {
  min-width: 220px;
}
</style>
