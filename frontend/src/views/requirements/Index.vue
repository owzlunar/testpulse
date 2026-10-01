<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import RequirementDialog from '@/components/requirements/RequirementDialog.vue'
import TestCaseAiDraftDialog from '@/components/test-cases/TestCaseAiDraftDialog.vue'
import TestCasePriorityChip from '@/components/test-cases/TestCasePriorityChip.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import {
  COVERAGE, REQUIREMENT_STATUSES, casesForRequirement, coverageOf, coverageStatus, requirementStatusOf, requirementTypeOf,
} from '@/services/requirement.service'
import { statusOf } from '@/services/test-case.service'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import { useRequirementStore } from '@/stores/requirement.store'
import type { CoverageStatus, Requirement, RequirementInput, RequirementStatus, Tone } from '@/types'
import { formatPercent } from '@/utils/format'
import { downloadText, toCsv } from '@/utils/table'

const router = useRouter()
const store = useRequirementStore()
const { current, loaded } = storeToRefs(store)
const { currentProject, currentCases } = storeToRefs(useProjectStore())
const { canCreate } = useTestCasePermissions()
const auth = useAuthStore()
const canEditRequirement = computed(() => auth.can('requirement.edit'))
const { snackbar, notify } = useSnackbar()
const { busy: saving, run } = useAsyncAction()

onMounted(() => run(() => store.ensureLoaded()))

const tab = ref<'list' | 'rtm'>('list')

// requirement + its cases + coverage, computed once for both tabs
const rows = computed(() =>
  current.value.map((r) => {
    const cases = casesForRequirement(r, currentCases.value)
    return { ...r, cases, coverage: coverageStatus(cases) }
  }),
)

const stats = computed(() => {
  const active = rows.value.filter((r) => r.status !== 'deprecated')
  const covered = active.filter((r) => r.coverage !== 'not_covered').length
  return [
    { label: 'Requirement ทั้งหมด', value: active.length, icon: 'tabler:clipboard-list', tone: 'primary' as Tone },
    { label: `ครอบคลุมด้วย Test Case · ${formatPercent(active.length ? (covered / active.length) * 100 : 0, 0)}`, value: covered, icon: 'tabler:link', tone: 'info' as Tone },
    { label: 'ยังไม่มี Test Case', value: active.filter((r) => r.coverage === 'not_covered').length, icon: 'tabler:circle-dashed', tone: 'error' as Tone },
    { label: 'เปลี่ยนแปลง ต้องทบทวนเคส', value: active.filter((r) => r.status === 'changed').length, icon: 'tabler:alert-triangle', tone: 'caution' as Tone },
  ]
})

// --- filters -----------------------------------------------------------------
const search = ref('')
const status = ref<RequirementStatus | null>(null)
const coverage = ref<CoverageStatus | null>(null)
const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return rows.value.filter(
    (r) =>
      (!q || `${r.code} ${r.title} ${r.description}`.toLowerCase().includes(q)) &&
      (!status.value || r.status === status.value) &&
      (!coverage.value || r.coverage === coverage.value),
  )
})

// --- create / edit / delete ----------------------------------------------------
const dialog = ref(false)
const editing = ref<Requirement | null>(null)
const confirmOpen = ref(false)
const deleting = ref<Requirement | null>(null)

function openCreate() {
  editing.value = null
  dialog.value = true
}

function openEdit(r: Requirement) {
  editing.value = r
  dialog.value = true
}

function onSave(input: RequirementInput) {
  run(() => store.save(input), (saved) => {
    dialog.value = false
    notify(`บันทึก ${saved.code} แล้ว`)
  })
}

function askDelete(r: Requirement) {
  deleting.value = r
  confirmOpen.value = true
}

function onDelete() {
  const r = deleting.value
  if (r) run(() => store.remove(r.id), () => notify(`ลบ ${r.code} แล้ว`))
}

// --- AI drafts for one requirement ---------------------------------------------------
const aiOpen = ref(false)
const aiFor = ref<Requirement | null>(null)
const aiText = computed(() =>
  aiFor.value ? `${aiFor.value.code}: ${aiFor.value.title}\n${aiFor.value.description}\n${aiFor.value.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}`.trim() : '',
)
function draftFor(r: Requirement) {
  aiFor.value = r
  aiOpen.value = true
}

const openCase = (id: string) => router.push({ path: '/test-cases', query: { caseId: id } })

function exportRtm() {
  const header = ['Requirement', 'ชื่อ', 'Priority', 'สถานะ', 'Test Cases', 'ผลล่าสุด', 'Coverage']
  const data = rows.value.map((r) => [
    r.code, r.title, r.priority, requirementStatusOf(r.status).label,
    r.cases.map((c) => c.id).join(' '), r.cases.map((c) => `${c.id}:${statusOf(c.status).label}`).join(' '), coverageOf(r.coverage).label,
  ])
  downloadText(`${currentProject.value?.key ?? 'PRJ'}_RTM.csv`, toCsv([header, ...data]))
  notify('ดาวน์โหลด Traceability Matrix (.csv) แล้ว')
}
</script>

<template>
  <FoxPageHeader sticky title="Requirements" :breadcrumbs="[{ title: 'Requirements' }]">
    <template #actions>
      <v-btn variant="outlined" prepend-icon="tabler:file-spreadsheet" @click="exportRtm">ส่งออก RTM</v-btn>
      <v-btn v-if="canEditRequirement" color="primary" prepend-icon="tabler:plus" @click="openCreate">เพิ่ม Requirement</v-btn>
    </template>
  </FoxPageHeader>

  <FoxPageSkeleton v-if="!loaded" />
  <div v-else class="fox-stack">
    <v-row class="fox-grid">
      <v-col v-for="s in stats" :key="s.icon" cols="12" sm="6" lg="3">
        <FoxStatCard v-bind="s" />
      </v-col>
    </v-row>

    <v-card>
      <v-tabs v-model="tab" class="px-4">
        <v-tab value="list" prepend-icon="tabler:list-details">รายการ Requirement</v-tab>
        <v-tab value="rtm" prepend-icon="tabler:table">Traceability Matrix</v-tab>
      </v-tabs>
      <v-divider />

      <div class="fox-card-body pb-0">
        <v-row dense class="row-gap-3 align-center">
          <v-col cols="12" md="5">
            <v-text-field v-model="search" density="compact" placeholder="ค้นหารหัส ชื่อ หรือรายละเอียด" prepend-inner-icon="tabler:search" aria-label="ค้นหา Requirement" clearable />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="status" :items="REQUIREMENT_STATUSES" item-title="label" item-value="value" density="compact" placeholder="ทุกสถานะ" aria-label="สถานะ" clearable />
          </v-col>
          <v-col cols="6" md="3">
            <v-select v-model="coverage" :items="COVERAGE" item-title="label" item-value="value" density="compact" placeholder="ทุก Coverage" aria-label="Coverage" clearable />
          </v-col>
        </v-row>
      </div>

      <v-window v-model="tab">
        <!-- list -->
        <v-window-item value="list">
          <div class="fox-card-body d-flex flex-column ga-3">
            <v-card v-for="r in filtered" :key="r.id" variant="flat" border class="pa-4">
              <div class="d-flex flex-wrap align-start ga-3">
                <div class="flex-grow-1 overflow-hidden req-main">
                  <div class="d-flex flex-wrap align-center ga-2 mb-1">
                    <v-chip color="primary" size="small" variant="flat" class="fox-num">{{ r.code }}</v-chip>
                    <v-chip :color="requirementStatusOf(r.status).tone" :prepend-icon="requirementStatusOf(r.status).icon" size="small" variant="tonal">
                      {{ requirementStatusOf(r.status).label }}
                    </v-chip>
                    <v-chip :prepend-icon="requirementTypeOf(r.type).icon" size="small" variant="outlined" color="secondary">{{ requirementTypeOf(r.type).label }}</v-chip>
                    <TestCasePriorityChip :priority="r.priority" />
                  </div>
                  <h3 class="text-h6">{{ r.title }}</h3>
                  <p v-if="r.description" class="text-body-2 text-muted mb-2">{{ r.description }}</p>
                  <ul v-if="r.acceptanceCriteria.length" class="req-ac text-body-2">
                    <li v-for="(ac, i) in r.acceptanceCriteria" :key="i"><v-icon icon="tabler:check" size="14" color="success" /> {{ ac }}</li>
                  </ul>
                </div>
                <div class="req-side">
                  <v-chip :color="coverageOf(r.coverage).tone" :prepend-icon="coverageOf(r.coverage).icon" variant="tonal" size="small" class="mb-2">
                    {{ coverageOf(r.coverage).label }}
                  </v-chip>
                  <div class="d-flex flex-wrap ga-1 mb-3">
                    <v-chip
                      v-for="c in r.cases"
                      :key="c.id"
                      :color="statusOf(c.status).tone"
                      size="x-small"
                      variant="tonal"
                      class="fox-num"
                      :title="`${c.name} · ${statusOf(c.status).label}`"
                      @click="openCase(c.id)"
                    >
                      {{ c.id }}
                    </v-chip>
                  </div>
                  <div class="d-flex flex-wrap ga-2">
                    <v-btn v-if="canCreate" variant="tonal" color="primary" size="small" prepend-icon="tabler:sparkles" @click="draftFor(r)">ร่างเคสด้วย AI</v-btn>
                    <v-btn v-if="canEditRequirement" icon="tabler:pencil" variant="text" size="small" color="primary" :aria-label="`แก้ไข ${r.code}`" @click="openEdit(r)" />
                    <v-btn v-if="auth.can('requirement.delete')" icon="tabler:trash" variant="text" size="small" color="error" :aria-label="`ลบ ${r.code}`" @click="askDelete(r)" />
                  </div>
                </div>
              </div>
            </v-card>
            <FoxEmptyState v-if="!filtered.length" icon="tabler:clipboard-list" title="ไม่พบ Requirement" text="เพิ่ม Requirement เพื่อเชื่อมโยงกับ Test Case" />
          </div>
        </v-window-item>

        <!-- traceability matrix -->
        <v-window-item value="rtm">
          <v-table class="mt-2">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Test Cases</th>
                <th class="text-center">ผ่าน / ทั้งหมด</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filtered" :key="r.id">
                <td>
                  <div class="py-3">
                    <div class="text-subtitle-2"><span class="text-primary fox-num mr-1">{{ r.code }}</span>{{ r.title }}</div>
                    <div class="text-caption text-muted">{{ requirementStatusOf(r.status).label }} · {{ requirementTypeOf(r.type).label }}</div>
                  </div>
                </td>
                <td>
                  <div class="d-flex flex-wrap ga-1">
                    <v-chip
                      v-for="c in r.cases"
                      :key="c.id"
                      :color="statusOf(c.status).tone"
                      :prepend-icon="statusOf(c.status).icon"
                      size="x-small"
                      variant="tonal"
                      class="fox-num"
                      @click="openCase(c.id)"
                    >
                      {{ c.id }}
                    </v-chip>
                    <span v-if="!r.cases.length" class="text-caption text-error">ยังไม่มีเคส</span>
                  </div>
                </td>
                <td class="text-center fox-num">{{ r.cases.filter((c) => c.status === 'passed').length }} / {{ r.cases.length }}</td>
                <td>
                  <v-chip :color="coverageOf(r.coverage).tone" :prepend-icon="coverageOf(r.coverage).icon" size="small" variant="tonal">{{ coverageOf(r.coverage).label }}</v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>
          <FoxEmptyState v-if="!filtered.length" icon="tabler:table" title="ไม่มีข้อมูล" />
        </v-window-item>
      </v-window>
    </v-card>
  </div>

  <RequirementDialog
    v-if="currentProject"
    v-model="dialog"
    :requirement="editing"
    :project-id="currentProject.id"
    :next-code="store.nextCode()"
    :loading="saving"
    @save="onSave"
  />
  <TestCaseAiDraftDialog
    v-model="aiOpen"
    :requirement="aiText"
    :requirement-ids="aiFor ? [aiFor.id] : []"
    @created="notify(`เพิ่ม ${$event} เคสให้ ${aiFor?.code} แล้ว`)"
  />
  <FoxConfirmDialog
    v-model="confirmOpen"
    title="ลบ Requirement?"
    :text="deleting ? `${deleting.code} จะถูกลบ (Test Case ที่เชื่อมไว้ยังอยู่)` : ''"
    confirm-text="ลบ"
    @confirm="onDelete"
  />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.req-main {
  min-width: 280px;
  flex-basis: 420px;
}

.req-side {
  flex: 0 1 300px;
}

.req-ac {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
