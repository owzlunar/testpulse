<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import TestCasePriorityChip from './TestCasePriorityChip.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import type { TestCaseTemplate } from '@/types'
import { templateApi } from '@/api'
import { TEMPLATE_CATEGORIES } from '@/domain/template'

// Pick a reusable test pattern; the parent opens the case form pre-filled with it
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ pick: [template: TestCaseTemplate] }>()

const templates = ref<TestCaseTemplate[]>([])
const loading = ref(false)
const search = ref('')
const category = ref<string | null>(null)
const selected = ref<TestCaseTemplate | null>(null)
const { run } = useAsyncAction()

watch(
  open,
  async (isOpen) => {
    if (!isOpen) return
    selected.value = null
    loading.value = true
    await run(async () => (templates.value = await templateApi.fetchTemplates()))
    loading.value = false
  },
  { immediate: true },
)

const categories = computed(() => [...new Set([...TEMPLATE_CATEGORIES, ...templates.value.map((t) => t.category)])])
const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return templates.value
    .filter((t) => (!category.value || t.category === category.value) && (!q || `${t.name} ${t.description}`.toLowerCase().includes(q)))
    .sort((a, b) => b.usageCount - a.usageCount)
})

function use(t: TestCaseTemplate) {
  templateApi.markTemplateUsed(t.id).catch(() => {})
  emit('pick', t)
  open.value = false
}

const confirmDelete = ref(false)
const deleting = ref<TestCaseTemplate | null>(null)
function askDelete(t: TestCaseTemplate) {
  deleting.value = t
  confirmDelete.value = true
}
function onDelete() {
  const t = deleting.value
  if (!t) return
  run(
    () => templateApi.deleteTemplate(t.id),
    () => {
      templates.value = templates.value.filter((x) => x.id !== t.id)
      if (selected.value?.id === t.id) selected.value = null
    },
  )
}
</script>

<template>
  <v-dialog v-model="open" max-width="1040">
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">เลือก Template</h2>
          <p class="text-body-2 text-muted">เริ่มจากรูปแบบการทดสอบที่ใช้บ่อย แล้วปรับให้ตรงกับระบบของคุณ</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <div class="fox-card-body pb-0">
        <v-row dense class="row-gap-3 align-center">
          <v-col cols="12" md="5">
            <v-text-field
              v-model="search"
              density="compact"
              placeholder="ค้นหา Template"
              prepend-inner-icon="tabler:search"
              aria-label="ค้นหา Template"
              clearable
            />
          </v-col>
          <v-col cols="12" md="7">
            <v-chip-group v-model="category" aria-label="หมวดหมู่">
              <v-chip v-for="c in categories" :key="c" :value="c" size="small" variant="tonal" color="primary" filter>{{ c }}</v-chip>
            </v-chip-group>
          </v-col>
        </v-row>
      </div>

      <v-card-text class="fox-card-body">
        <div class="tpl-layout">
          <!-- list -->
          <div class="tpl-list">
            <template v-if="loading">
              <v-skeleton-loader v-for="i in 5" :key="i" type="list-item-two-line" />
            </template>
            <template v-else>
              <button
                v-for="t in filtered"
                :key="t.id"
                type="button"
                class="tpl-item"
                :class="{ 'tpl-item--active': selected?.id === t.id }"
                @click="selected = t"
                @dblclick="use(t)"
              >
                <v-avatar color="primary" rounded="lg" size="40"><v-icon icon="tabler:template" size="20" /></v-avatar>
                <span class="flex-grow-1 overflow-hidden text-start">
                  <span class="d-block text-subtitle-2 text-truncate">{{ t.name }}</span>
                  <span class="d-block text-caption text-muted text-truncate">{{ t.category }} · ใช้ {{ t.usageCount }} ครั้ง</span>
                </span>
                <v-chip v-if="!t.builtIn" size="x-small" variant="tonal" color="info">ของทีม</v-chip>
              </button>
              <FoxEmptyState v-if="!filtered.length" icon="tabler:template-off" title="ไม่พบ Template" text="ลองเปลี่ยนคำค้นหรือหมวดหมู่" />
            </template>
          </div>

          <!-- preview -->
          <div class="tpl-preview">
            <template v-if="selected">
              <div class="d-flex align-start justify-space-between ga-2 mb-1">
                <h3 class="text-h6">{{ selected.draft.name }}</h3>
                <v-btn
                  v-if="!selected.builtIn"
                  icon="tabler:trash"
                  variant="text"
                  size="small"
                  color="error"
                  aria-label="ลบ Template"
                  @click="askDelete(selected)"
                />
              </div>
              <div class="d-flex flex-wrap align-center ga-2 mb-3">
                <v-chip size="x-small" variant="tonal" color="primary">{{ selected.category }}</v-chip>
                <TestCasePriorityChip :priority="selected.draft.priority" />
              </div>
              <p class="text-body-2 text-muted">{{ selected.description }}</p>
              <div class="text-overline text-muted mt-4">Prerequisite</div>
              <p class="text-body-2 tpl-pre">{{ selected.draft.prerequisite }}</p>
              <div class="text-overline text-muted mt-2 mb-1">ขั้นตอน ({{ selected.draft.steps.length }})</div>
              <ol class="tpl-steps text-body-2">
                <li v-for="(st, i) in selected.draft.steps" :key="i">
                  {{ st.action }}
                  <span v-if="st.testData && st.testData !== '-'" class="text-muted"> · {{ st.testData }}</span>
                  <div class="text-caption text-success">→ {{ st.expectedResult }}</div>
                </li>
              </ol>
              <div class="text-overline text-muted mt-2">Expected Result</div>
              <p class="text-body-2 mb-0">{{ selected.draft.expectedResults }}</p>
            </template>
            <FoxEmptyState v-else icon="tabler:hand-click" title="เลือก Template ทางซ้ายเพื่อดูตัวอย่าง" text="ดับเบิลคลิกเพื่อใช้ทันที" />
          </div>
        </div>
      </v-card-text>

      <v-divider />
      <div class="d-flex justify-end ga-3 fox-card-body py-4">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:check" :disabled="!selected" @click="selected && use(selected)">ใช้ Template นี้</v-btn>
      </div>
    </v-card>
  </v-dialog>

  <FoxConfirmDialog
    v-model="confirmDelete"
    title="ลบ Template?"
    :text="deleting ? `“${deleting.name}” จะถูกลบสำหรับทุกคนในทีม` : ''"
    confirm-text="ลบ"
    @confirm="onDelete"
  />
</template>

<style scoped>
.tpl-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: var(--fox-gutter);
  min-height: 420px;
}

.tpl-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 520px;
  overflow-y: auto;
}

.tpl-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  border-radius: var(--fox-radius-control);
  color: inherit;
  transition: background-color 0.15s;
}

.tpl-item:hover,
.tpl-item:focus-visible {
  background: rgba(var(--v-theme-primary), 0.04);
  outline: none;
}

.tpl-item--active {
  background: rgba(var(--v-theme-primary), 0.1);
}

.tpl-preview {
  padding: var(--fox-card-padding);
  border-radius: var(--fox-radius-control);
  background: rgba(var(--v-theme-on-surface), 0.03);
  max-height: 520px;
  overflow-y: auto;
}

.tpl-pre {
  white-space: pre-line;
}

.tpl-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 20px;
  margin: 0;
}

@media (max-width: 959.98px) {
  .tpl-layout {
    grid-template-columns: 1fr;
  }
}
</style>
