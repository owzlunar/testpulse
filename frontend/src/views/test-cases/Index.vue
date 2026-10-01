<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import ProjectAvatar from '@/components/projects/ProjectAvatar.vue'
import TestCaseList from '@/components/test-cases/TestCaseList.vue'
import TestCaseDialog from '@/components/test-cases/TestCaseDialog.vue'
import TestCaseHistoryDialog from '@/components/test-cases/TestCaseHistoryDialog.vue'
import TestCaseProgress from '@/components/test-cases/TestCaseProgress.vue'
import ExtendDueDateDialog from '@/components/test-cases/ExtendDueDateDialog.vue'
import TemplatePickerDialog from '@/components/test-cases/TemplatePickerDialog.vue'
import SaveTemplateDialog from '@/components/test-cases/SaveTemplateDialog.vue'
import TestCaseImportDialog from '@/components/test-cases/TestCaseImportDialog.vue'
import TestCaseAiDraftDialog from '@/components/test-cases/TestCaseAiDraftDialog.vue'
import TestCaseRemoveDialog from '@/components/test-cases/TestCaseRemoveDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { isHighChurn, isOverdue } from '@/services/test-case.service'
import { useProjectStore } from '@/stores/project.store'
import { useRequirementStore } from '@/stores/requirement.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase, TestCaseInput, TestCaseTemplate } from '@/types'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const { currentProject, currentTree, currentStats, currentCases } = storeToRefs(projectStore)
const store = useTestCaseStore()
// cards show linked requirements by code and title; until loaded they show the case's own text
useRequirementStore().ensureLoaded().catch(() => {})
const { canCreate, canExportUat } = useTestCasePermissions()
const { snackbar, notify } = useSnackbar()
const { busy: saving, run } = useAsyncAction()

const stats = computed(() => [
  { label: 'รอ Dev พัฒนา', value: currentStats.value.byStatus.pending, icon: 'tabler:code', tone: 'primary' as const },
  { label: 'พร้อมให้ QA ทดสอบ', value: currentStats.value.byStatus.ready_for_test, icon: 'tabler:send', tone: 'info' as const },
  { label: 'เลยกำหนด SLA', value: currentCases.value.filter(isOverdue).length, icon: 'tabler:clock-exclamation', tone: 'error' as const },
  { label: 'แก้ซ้ำ > 1 รอบ', value: currentCases.value.filter(isHighChurn).length, icon: 'tabler:flame', tone: 'caution' as const },
])

// --- dialogs -----------------------------------------------------------------
const formOpen = ref(false)
const editing = ref<TestCase | null>(null)
const parentId = ref<string | null>(null)
const preset = ref<Partial<TestCase> | null>(null)

// faster authoring
const templateOpen = ref(false)
const saveTemplateOpen = ref(false)
const importOpen = ref(false)
const aiOpen = ref(false)

const createOptions = [
  { title: 'เริ่มจากฟอร์มว่าง', subtitle: 'กรอกเองทุกช่อง', icon: 'tabler:file-plus', action: () => openCreate() },
  { title: 'จาก Template', subtitle: 'รูปแบบการทดสอบที่ใช้บ่อย', icon: 'tabler:template', action: () => (templateOpen.value = true) },
  { title: 'ร่างด้วย AI', subtitle: 'วาง Requirement แล้วให้ระบบร่างเคส', icon: 'tabler:sparkles', action: () => (aiOpen.value = true) },
  { title: 'นำเข้าจาก Excel / CSV', subtitle: 'หลายเคสในครั้งเดียว', icon: 'tabler:file-import', action: () => (importOpen.value = true) },
]

function fromTemplate(t: TestCaseTemplate) {
  editing.value = null
  parentId.value = null
  preset.value = {
    ...t.draft,
    steps: t.draft.steps.map((st, i) => ({ ...st, id: `s-${Date.now()}-${i}`, stepNumber: i + 1 })),
  }
  formOpen.value = true
}

/** copy of a case as a new one: same spec, fresh status / history */
function openClone(tc: TestCase) {
  editing.value = null
  parentId.value = tc.parentId ?? null
  preset.value = {
    name: `${tc.name} (สำเนา)`,
    requirement: tc.requirement,
    requirementIds: tc.requirementIds,
    testScenario: tc.testScenario,
    prerequisite: tc.prerequisite,
    description: tc.description,
    priority: tc.priority,
    expectedResults: tc.expectedResults,
    expectedImages: [...tc.expectedImages],
    assignedDev: tc.assignedDev,
    steps: tc.steps.map((st, i) => ({ ...st, id: `s-${Date.now()}-${i}` })),
  }
  formOpen.value = true
}

function openSaveTemplate(tc: TestCase) {
  target.value = tc
  saveTemplateOpen.value = true
}

const historyOpen = ref(false)
const extendOpen = ref(false)
const target = ref<TestCase | null>(null)

// archive (default) / permanent delete from the archive, both confirmed with their impact
const removeOpen = ref(false)
const removeMode = ref<'archive' | 'delete'>('archive')
const removing = ref<TestCase | null>(null)
const archived = computed(() => (currentProject.value ? store.archivedOf(currentProject.value.id) : []))

function openCreate(parent: string | null = null) {
  editing.value = null
  preset.value = null
  parentId.value = parent
  formOpen.value = true
}

function openEdit(tc: TestCase) {
  editing.value = tc
  preset.value = null
  parentId.value = tc.parentId ?? null
  formOpen.value = true
}

function onSave(input: TestCaseInput) {
  const current = editing.value
  run(
    () => (current ? store.update(current.id, input, current.projectId) : store.create(input)),
    () => {
      formOpen.value = false
      notify(current ? `บันทึก ${input.id} แล้ว` : `สร้าง ${input.id} แล้ว`)
    },
  )
}

function openHistory(tc: TestCase) {
  target.value = tc
  historyOpen.value = true
}

function openExtend(tc: TestCase) {
  target.value = tc
  extendOpen.value = true
}

function askRemove(tc: TestCase, mode: 'archive' | 'delete') {
  removing.value = tc
  removeMode.value = mode
  removeOpen.value = true
}

function onRemove() {
  const tc = removing.value
  if (!tc) return
  const archiving = removeMode.value === 'archive'
  run(
    async () => void (archiving ? await store.archive(tc.id, tc.projectId) : await store.remove(tc.id, tc.projectId)),
    () => {
      removeOpen.value = false
      notify(archiving ? `เก็บ ${tc.id} เข้าคลังแล้ว กู้คืนได้จากแท็บคลังเก็บ` : `ลบ ${tc.id} ถาวรแล้ว`)
    },
  )
}

function onRestore(tc: TestCase) {
  run(() => store.restore(tc.id, tc.projectId), () => notify(`กู้คืน ${tc.id} แล้ว`))
}

function exportMarkdown() {
  const file = projectStore.exportMarkdown()
  if (file) notify(`ดาวน์โหลด ${file} แล้ว`)
}


// deep link from notifications / search: /test-cases?caseId=TC-101
watch(
  () => route.query.caseId,
  (caseId) => {
    const tc = typeof caseId === 'string' ? store.getById(caseId, currentProject.value?.id) : undefined
    if (tc) openEdit(tc)
    if (caseId) router.replace({ query: {} })
  },
  { immediate: true },
)
</script>

<template>
  <FoxPageHeader title="Test Cases" :breadcrumbs="[{ title: 'Test Cases' }]">
    <template #actions>
      <v-menu location="bottom end">
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="outlined" prepend-icon="tabler:file-export" append-icon="tabler:chevron-down">ส่งออก</v-btn>
        </template>
        <v-list min-width="260">
          <v-list-subheader>เอกสารทางการ (Word / PDF)</v-list-subheader>
          <v-list-item prepend-icon="tabler:file-description" title="Test Specification" subtitle="รายละเอียดเคสและขั้นตอน" :to="{ path: '/documents', query: { create: 'test_spec' } }" />
          <v-list-item prepend-icon="tabler:table" title="Traceability Matrix" subtitle="Requirement ↔ Test Case" :to="{ path: '/documents', query: { create: 'rtm' } }" />
          <v-divider class="my-1" />
          <v-list-subheader>ไฟล์</v-list-subheader>
          <v-list-item prepend-icon="tabler:markdown" title="Obsidian Markdown (.md)" subtitle="Test Suite และ Vault Notes" @click="exportMarkdown" />
        </v-list>
      </v-menu>
      <v-btn v-if="canExportUat" variant="tonal" color="primary" prepend-icon="tabler:certificate" :to="{ path: '/documents', query: { create: 'uat' } }">เอกสาร UAT</v-btn>
      <v-menu v-if="canCreate" location="bottom end">
        <template #activator="{ props }">
          <v-btn v-bind="props" color="primary" prepend-icon="tabler:plus" append-icon="tabler:chevron-down">สร้าง Test Case</v-btn>
        </template>
        <v-list min-width="300">
          <v-list-item v-for="o in createOptions" :key="o.title" :prepend-icon="o.icon" :title="o.title" :subtitle="o.subtitle" class="py-2" @click="o.action" />
        </v-list>
      </v-menu>
    </template>
  </FoxPageHeader>

  <div class="fox-stack">
    <!-- project summary -->
    <v-card class="fox-card-body">
      <div class="d-flex flex-wrap align-center ga-4 mb-5">
        <ProjectAvatar :project="currentProject" size="52" />
        <div class="flex-grow-1 overflow-hidden">
          <div class="d-flex flex-wrap align-center ga-2">
            <h2 class="text-h5">{{ currentProject?.name ?? 'ยังไม่ได้เลือกโปรเจกต์' }}</h2>
            <v-chip v-if="currentProject" size="small" color="primary" variant="tonal">{{ currentProject.key }}</v-chip>
          </div>
          <p class="text-body-2 text-muted fox-clamp-2 mb-0">{{ currentProject?.description }}</p>
        </div>
      </div>
      <TestCaseProgress :stats="currentStats" :height="10" />
    </v-card>

    <v-row class="fox-grid">
      <v-col v-for="s in stats" :key="s.label" cols="12" sm="6" lg="3">
        <FoxStatCard v-bind="s" />
      </v-col>
    </v-row>

    <TestCaseList
      v-if="currentProject"
      :project-id="currentProject.id"
      :cases="currentTree"
      :archived="archived"
      @create="openCreate()"
      @add-subcase="openCreate"
      @edit="openEdit"
      @archive="askRemove($event, 'archive')"
      @restore="onRestore"
      @purge="askRemove($event, 'delete')"
      @history="openHistory"
      @extend="openExtend"
      @clone="openClone"
      @save-template="openSaveTemplate"
      @reordered="notify"
    />
  </div>

  <TestCaseDialog v-model="formOpen" :test-case="editing" :parent-id="parentId" :preset="preset" :loading="saving" @save="onSave" />
  <TemplatePickerDialog v-model="templateOpen" @pick="fromTemplate" />
  <SaveTemplateDialog v-model="saveTemplateOpen" :test-case="target" @saved="notify(`บันทึก Template “${$event}” แล้ว`)" />
  <TestCaseImportDialog v-model="importOpen" @imported="notify(`นำเข้า ${$event} เคสแล้ว`)" />
  <TestCaseAiDraftDialog v-model="aiOpen" @created="notify(`เพิ่ม ${$event} เคสจากร่าง AI แล้ว`)" />
  <TestCaseHistoryDialog v-model="historyOpen" :test-case="target" @restored="notify" />
  <ExtendDueDateDialog v-model="extendOpen" :test-case="target" @extended="notify(`ขยายกำหนดส่ง ${$event.id} แล้ว`)" />
  <TestCaseRemoveDialog v-model="removeOpen" :test-case="removing" :mode="removeMode" :loading="saving" @confirm="onRemove" />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
