<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxImportMapping from '@/components/ui/FoxImportMapping.vue'
import FoxImportSource from '@/components/ui/FoxImportSource.vue'
import FoxSteps from '@/components/ui/FoxSteps.vue'
import TestCasePriorityChip from '@/components/test-cases/TestCasePriorityChip.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useTableImport, type ImportField } from '@/composables/useTableImport'
import { useProjectStore } from '@/stores/project.store'
import { useRequirementStore } from '@/stores/requirement.store'
import type { RequirementImportResult, RequirementImportRow } from '@/types'
import { originLabel, requirementFromCells, requirementOriginOf, type RequirementCells } from '@/domain/requirement'

// Import requirements (usually the TOR's clauses) from Excel (copy & paste) or CSV: one row each.
// Rows without a code get the next free one from the server; a code that exists is skipped or updated.
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ imported: [result: RequirementImportResult] }>()

const { currentProject } = storeToRefs(useProjectStore())
const store = useRequirementStore()
const { busy, run } = useAsyncAction()

type Field = keyof RequirementCells
const FIELDS: ImportField<Field>[] = [
  { key: 'code', label: 'รหัส', aliases: ['code', 'id', 'req id', 'requirement id', 'รหัส'] },
  { key: 'torClause', label: 'ข้อใน TOR', aliases: ['tor', 'tor clause', 'clause', 'ข้อ', 'ข้อใน tor', 'ข้อ tor'] },
  { key: 'title', label: 'ชื่อ Requirement', required: true, aliases: ['title', 'name', 'requirement', 'ชื่อ', 'ชื่อ requirement', 'หัวข้อ'] },
  { key: 'description', label: 'รายละเอียด / User Story', aliases: ['description', 'detail', 'details', 'user story', 'รายละเอียด'] },
  {
    key: 'acceptanceCriteria',
    label: 'Acceptance Criteria',
    aliases: ['acceptance criteria', 'ac', 'criteria', 'เกณฑ์การยอมรับ', 'เงื่อนไขการยอมรับ'],
  },
  { key: 'origin', label: 'ข้อกำหนดจาก (TOR / เพิ่มเติม)', aliases: ['origin', 'ที่มา', 'ข้อกำหนดจาก'] },
  { key: 'type', label: 'ประเภท', aliases: ['type', 'ประเภท'] },
  { key: 'priority', label: 'Priority', aliases: ['priority', 'ความสำคัญ'] },
  { key: 'status', label: 'สถานะ', aliases: ['status', 'สถานะ'] },
  { key: 'source', label: 'แหล่งที่มา', aliases: ['source', 'reference', 'แหล่งที่มา', 'อ้างอิง'] },
]

const SAMPLE = [
  ['ข้อใน TOR', 'ชื่อ', 'รายละเอียด', 'Acceptance Criteria', 'ประเภท', 'Priority'],
  [
    '4.1.1',
    'ผู้ใช้เข้าสู่ระบบด้วยบัญชีองค์กร',
    'รองรับ SSO ของหน่วยงาน',
    'เข้าสู่ระบบได้ภายใน 3 วินาที\nล็อกบัญชีเมื่อผิด 5 ครั้ง',
    'Functional',
    'High',
  ],
  ['4.1.2', 'ออกรายงานสรุปรายเดือน', '', 'ส่งออกเป็น PDF และ Excel', 'Functional', 'Medium'],
  ['', 'แจ้งเตือนทางอีเมลเมื่ออนุมัติ (เพิ่มเติมจากการประชุม)', '', 'ส่งภายใน 1 นาที', 'Functional', 'Low'],
]

// --- step 1: source · step 2: mapping (useTableImport) ---------------------------------
const step = ref(1)
const updateExisting = ref(false)
const { source, text, fileName, hasHeader, reset, onFile, header, body, rowNumber, mapping, autoMap, columnOptions, cell, sample, mappingValid } =
  useTableImport(FIELDS)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    step.value = 1
    updateExisting.value = false
    reset()
  },
  { immediate: true },
)

// --- step 3: preview ----------------------------------------------------------------
interface Parsed extends RequirementImportRow {
  row: number
  /** the code exists in the project: skipped, or updated */
  exists: boolean
  errors: string[]
}

const existingCodes = computed(() => new Set(store.current.map((r) => r.code)))

const parsed = computed<Parsed[]>(() => {
  const out = body.value.map((r, i): Parsed => {
    const cells = Object.fromEntries(FIELDS.map((f) => [f.key, cell(r, f.key)])) as RequirementCells
    const req = requirementFromCells(cells)
    const errors: string[] = []
    if (!req.title) errors.push('ไม่มีชื่อ Requirement')
    if (req.origin === 'tor' && !req.torClause) errors.push('Requirement ตาม TOR ต้องระบุข้อใน TOR')
    return { ...req, row: rowNumber(i), exists: !!req.code && existingCodes.value.has(req.code), errors }
  })
  // the same code twice in the file: the server would refuse the whole import
  const codes = out.map((p) => p.code).filter(Boolean)
  out.forEach((p) => p.code && codes.indexOf(p.code) !== codes.lastIndexOf(p.code) && p.errors.push(`รหัส ${p.code} ซ้ำในไฟล์`))
  return out
})

const valid = computed(() => parsed.value.filter((p) => !p.errors.length))
const invalid = computed(() => parsed.value.filter((p) => p.errors.length))
const toCreate = computed(() => valid.value.filter((p) => !p.exists).length)
const toUpdate = computed(() => (updateExisting.value ? valid.value.filter((p) => p.exists).length : 0))
const toSkip = computed(() => (updateExisting.value ? 0 : valid.value.filter((p) => p.exists).length))

function next() {
  if (step.value === 1) autoMap()
  step.value++
}

function submit() {
  const project = currentProject.value
  if (!project || !valid.value.length) return
  const rows = valid.value.map(({ row: _row, exists: _exists, errors: _errors, ...r }) => r)
  run(
    () => store.importMany(project.id, rows, updateExisting.value),
    (result) => emit('imported', result),
  )
}

const steps = ['แหล่งข้อมูล', 'จับคู่คอลัมน์', 'ตรวจสอบและนำเข้า']
</script>

<template>
  <v-dialog v-model="open" max-width="980" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">นำเข้า Requirement</h2>
          <p class="text-body-2 text-muted">จาก Excel, Google Sheets หรือไฟล์ CSV เช่น ข้อกำหนดใน TOR เข้าโปรเจกต์ {{ currentProject?.name }}</p>
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
              :template="{ name: 'testpulse-requirements-template.csv', rows: SAMPLE }"
              placeholder="ข้อใน TOR	ชื่อ	รายละเอียด	…"
              @file="onFile"
            >
              <v-alert type="info" variant="tonal" density="compact" icon="tabler:info-circle" class="mt-2">
                หนึ่งแถวต่อหนึ่ง Requirement — แถวที่มีข้อใน TOR เป็น Requirement ตาม TOR (ถ้าไม่มีคอลัมน์ "ข้อกำหนดจาก") · ไม่มีรหัส
                ระบบจะออกรหัสถัดไปให้ · Acceptance Criteria หนึ่งบรรทัดต่อหนึ่งข้อ
              </v-alert>
            </FoxImportSource>
          </v-window-item>

          <!-- 2. mapping -->
          <v-window-item :value="2">
            <FoxImportMapping v-model="mapping" :fields="FIELDS" :columns="columnOptions" :sample="sample" />
          </v-window-item>

          <!-- 3. preview -->
          <v-window-item :value="3">
            <div class="d-flex flex-wrap ga-2 mb-2">
              <v-chip color="success" variant="tonal" prepend-icon="tabler:circle-plus">เพิ่มใหม่ {{ toCreate }}</v-chip>
              <v-chip v-if="toUpdate" color="info" variant="tonal" prepend-icon="tabler:pencil">อัปเดต {{ toUpdate }}</v-chip>
              <v-chip v-if="toSkip" variant="tonal" prepend-icon="tabler:player-skip-forward">ข้าม (มีรหัสอยู่แล้ว) {{ toSkip }}</v-chip>
              <v-chip v-if="invalid.length" color="error" variant="tonal" prepend-icon="tabler:alert-circle"
                >ข้อมูลไม่ครบ {{ invalid.length }}</v-chip
              >
            </div>
            <v-checkbox
              v-model="updateExisting"
              label="อัปเดต Requirement ที่มีรหัสอยู่แล้ว"
              hint="เช่น TOR ฉบับแก้ไข: ถ้าชื่อ รายละเอียด หรือ Acceptance Criteria เปลี่ยน Test Case ที่เชื่อมไว้จะถูกแจ้งให้ทบทวน"
              persistent-hint
              class="mb-4"
            />
            <v-table v-if="parsed.length" density="comfortable">
              <thead>
                <tr>
                  <th>แถว</th>
                  <th>รหัส</th>
                  <th>ที่มา</th>
                  <th>ชื่อ</th>
                  <th>Priority</th>
                  <th>ผล</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in parsed" :key="p.row" :class="{ 'imp-row--error': p.errors.length }">
                  <td class="fox-num text-muted">{{ p.row }}</td>
                  <td class="fox-num text-no-wrap">{{ p.code || 'รหัสใหม่' }}</td>
                  <td class="text-no-wrap">
                    <v-chip :color="requirementOriginOf(p.origin).tone" size="x-small" variant="outlined">{{ originLabel(p) }}</v-chip>
                  </td>
                  <td>
                    <div class="text-body-2">{{ p.title || '(ไม่มีชื่อ)' }}</div>
                    <div v-if="p.acceptanceCriteria.length" class="text-caption text-muted">AC {{ p.acceptanceCriteria.length }} ข้อ</div>
                  </td>
                  <td><TestCasePriorityChip :priority="p.priority" /></td>
                  <td class="text-body-2">
                    <span v-if="p.errors.length" class="text-error">{{ p.errors.join(' · ') }}</span>
                    <span v-else-if="p.exists" class="text-muted">{{ updateExisting ? 'อัปเดต' : 'ข้าม' }}</span>
                    <span v-else class="text-success">เพิ่มใหม่</span>
                  </td>
                </tr>
              </tbody>
            </v-table>
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
        <v-btn v-else color="primary" prepend-icon="tabler:file-import" :loading="busy" :disabled="!toCreate && !toUpdate" @click="submit">
          นำเข้า {{ toCreate + toUpdate }} รายการ
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.imp-body {
  min-height: 380px;
}

.imp-row--error {
  background: rgba(var(--v-theme-error), 0.04);
}
</style>
