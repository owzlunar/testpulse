<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { draftKindOf, draftTestCases, type DraftOptions } from '@/services/ai.service'
import { PRIORITIES } from '@/services/test-case.service'
import { useProjectStore } from '@/stores/project.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCaseDraft } from '@/types'

// Requirement in -> reviewed drafts out. Nothing is saved until QA picks the drafts to keep.
const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    /** pre-filled requirement text (e.g. from the Requirements page) */
    requirement?: string
    requirementIds?: string[]
  }>(),
  { requirement: '', requirementIds: () => [] },
)
const emit = defineEmits<{ created: [count: number] }>()

const { currentProject, currentCases } = storeToRefs(useProjectStore())
const store = useTestCaseStore()
const generating = useAsyncAction()
const saving = useAsyncAction()

const requirementText = ref('')
const options = reactive<DraftOptions>({ positive: true, negative: true, boundary: true, context: '' })
const drafts = ref<(TestCaseDraft & { keep: boolean })[]>([])
const expanded = ref<number[]>([])

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    requirementText.value = props.requirement
    drafts.value = []
  },
  { immediate: true },
)

// requirements already written on cases in this project, for one-click reuse
const knownRequirements = computed(() => [...new Set(currentCases.value.map((c) => c.requirement).filter(Boolean))])

function generate() {
  generating.run(
    () => draftTestCases(requirementText.value, options),
    (result) => {
      drafts.value = result.map((d) => ({ ...d, requirementIds: props.requirementIds, keep: true }))
      expanded.value = []
    },
  )
}

const kept = computed(() => drafts.value.filter((d) => d.keep))

function save() {
  const project = currentProject.value
  if (!project) return
  const list = kept.value.map(({ keep: _keep, ...d }) => d)
  saving.run(
    () => store.createMany(project.id, list, 'สร้างจาก AI'),
    (saved) => {
      emit('created', saved.length)
      open.value = false
    },
  )
}
</script>

<template>
  <v-dialog v-model="open" max-width="1040" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div class="d-flex align-center ga-3">
          <v-avatar color="primary" rounded="lg" size="44"><v-icon icon="tabler:sparkles" size="22" /></v-avatar>
          <div>
            <h2 class="text-h5">ร่าง Test Case ด้วย AI</h2>
            <p class="text-body-2 text-muted">วาง Requirement แล้วให้ระบบร่างเคสให้ คุณตรวจแก้และเลือกเคสที่จะเก็บ</p>
          </div>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <v-card-text class="fox-card-body">
        <v-row class="fox-grid">
          <!-- input -->
          <v-col cols="12" md="5">
            <div class="fox-stack">
              <div>
                <label class="fox-label" for="ai-req">Requirement / User Story *</label>
                <v-textarea
                  id="ai-req"
                  v-model="requirementText"
                  rows="6"
                  auto-grow
                  placeholder="เช่น REQ-PAY-05: ลูกค้าสามารถชำระเงินด้วย PromptPay QR โดย QR หมดอายุใน 15 นาที และระบบต้องไม่บันทึกรายการซ้ำเมื่อธนาคารส่ง callback ซ้ำ"
                />
                <v-menu v-if="knownRequirements.length">
                  <template #activator="{ props: menu }">
                    <v-btn v-bind="menu" variant="text" size="small" color="primary" prepend-icon="tabler:list-search" class="mt-1"
                      >ใช้ Requirement ที่มีในโปรเจกต์</v-btn
                    >
                  </template>
                  <v-list max-width="420">
                    <v-list-item v-for="r in knownRequirements" :key="r" :title="r" class="text-body-2" @click="requirementText = r" />
                  </v-list>
                </v-menu>
              </div>
              <div>
                <span class="fox-label">ประเภทเคสที่ต้องการ</span>
                <div class="d-flex flex-wrap ga-4">
                  <v-checkbox v-model="options.positive" color="success" label="Positive (เส้นทางหลัก)" />
                  <v-checkbox v-model="options.negative" color="error" label="Negative (ข้อมูลผิด / สิทธิ์)" />
                  <v-checkbox v-model="options.boundary" color="info" label="Boundary (ค่าขอบเขต)" />
                </div>
              </div>
              <div>
                <label class="fox-label" for="ai-ctx">บริบทเพิ่มเติม</label>
                <v-text-field id="ai-ctx" v-model="options.context" placeholder="เช่น Mobile app iOS/Android, รองรับ 5,000 TPS" />
              </div>
              <v-btn
                color="primary"
                size="large"
                prepend-icon="tabler:sparkles"
                :loading="generating.busy.value"
                :disabled="!requirementText.trim() || !(options.positive || options.negative || options.boundary)"
                @click="generate"
              >
                {{ drafts.length ? 'สร้างร่างใหม่' : 'สร้างร่าง Test Case' }}
              </v-btn>
            </div>
          </v-col>

          <!-- results -->
          <v-col cols="12" md="7">
            <div class="ai-results">
              <template v-if="generating.busy.value">
                <div class="text-body-2 text-muted mb-3 d-flex align-center ga-2">
                  <v-progress-circular indeterminate size="16" width="2" color="primary" /> กำลังวิเคราะห์ Requirement และร่างเคส…
                </div>
                <v-skeleton-loader v-for="i in 3" :key="i" type="list-item-three-line" class="mb-2" />
              </template>
              <template v-else-if="drafts.length">
                <div class="d-flex align-center justify-space-between mb-3">
                  <span class="text-subtitle-2">ร่าง {{ drafts.length }} เคส · เลือกแล้ว {{ kept.length }}</span>
                  <v-btn variant="text" size="small" @click="drafts.forEach((d) => (d.keep = kept.length !== drafts.length))">
                    {{ kept.length === drafts.length ? 'ไม่เลือกทั้งหมด' : 'เลือกทั้งหมด' }}
                  </v-btn>
                </div>
                <div class="d-flex flex-column ga-3">
                  <v-card v-for="(d, i) in drafts" :key="i" variant="flat" border class="pa-4" :class="{ 'ai-draft--off': !d.keep }">
                    <div class="d-flex align-start ga-2">
                      <v-checkbox-btn v-model="d.keep" class="flex-grow-0" :aria-label="`เลือก ${d.name}`" />
                      <div class="flex-grow-1 overflow-hidden">
                        <div class="d-flex flex-wrap align-center ga-2 mb-2">
                          <v-chip :color="draftKindOf(d.kind).tone" :prepend-icon="draftKindOf(d.kind).icon" size="x-small" variant="tonal">{{
                            draftKindOf(d.kind).label
                          }}</v-chip>
                          <span class="text-caption text-muted">{{ d.steps.length }} ขั้นตอน</span>
                        </div>
                        <v-text-field v-model="d.name" density="compact" :aria-label="`ชื่อเคส ${i + 1}`" class="mb-2" />
                        <div class="d-flex flex-wrap align-center ga-2">
                          <v-select
                            v-model="d.priority"
                            :items="PRIORITIES"
                            item-title="label"
                            item-value="value"
                            density="compact"
                            class="ai-priority"
                            aria-label="Priority"
                          />
                          <v-btn
                            variant="text"
                            size="small"
                            :append-icon="expanded.includes(i) ? 'tabler:chevron-up' : 'tabler:chevron-down'"
                            @click="expanded = expanded.includes(i) ? expanded.filter((x) => x !== i) : [...expanded, i]"
                          >
                            ขั้นตอน
                          </v-btn>
                        </div>
                        <v-expand-transition>
                          <div v-if="expanded.includes(i)" class="mt-3">
                            <div class="text-caption text-muted mb-1">Prerequisite: {{ d.prerequisite }}</div>
                            <ol class="text-body-2 pl-5">
                              <li v-for="(st, j) in d.steps" :key="j" class="mb-1">
                                {{ st.action }} <span class="text-muted">· {{ st.testData }}</span>
                                <div class="text-caption text-success">→ {{ st.expectedResult }}</div>
                              </li>
                            </ol>
                            <div class="text-caption mt-1"><span class="text-muted">Expected:</span> {{ d.expectedResults }}</div>
                          </div>
                        </v-expand-transition>
                      </div>
                    </div>
                  </v-card>
                </div>
              </template>
              <FoxEmptyState
                v-else
                icon="tabler:sparkles"
                title="ร่างจะแสดงที่นี่"
                text="ระบบจะแยกเคส Positive, Negative และ Boundary ให้ตรวจทานก่อนบันทึก"
              />
            </div>
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider />
      <div class="d-flex flex-wrap align-center ga-3 fox-card-body py-4">
        <span class="text-body-2 text-muted">เคสที่เพิ่มจะมีสถานะ Pending Dev และตรวจแก้ต่อได้ตามปกติ</span>
        <v-spacer />
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:plus" :loading="saving.busy.value" :disabled="!kept.length" @click="save"
          >เพิ่ม {{ kept.length }} เคส</v-btn
        >
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.ai-results {
  min-height: 360px;
  max-height: 560px;
  overflow-y: auto;
  padding: 2px;
}

.ai-draft--off {
  opacity: 0.55;
}

.ai-priority {
  max-width: 160px;
}
</style>
