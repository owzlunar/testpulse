<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxTablePagination from '@/components/ui/FoxTablePagination.vue'
import DefectDialog from '@/components/defects/DefectDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { DEFECT_STATUSES, SEVERITIES, defectStatusOf, isOpenDefect, severityOf } from '@/services/defect.service'
import { useAuthStore } from '@/stores/auth.store'
import { useDefectStore } from '@/stores/defect.store'
import type { Defect, DefectInput, DefectSeverity, DefectStatus, Tone } from '@/types'
import { formatDateTime, formatRelative } from '@/utils/date'
import { firstName } from '@/utils/format'

const auth = useAuthStore()

const route = useRoute()
const router = useRouter()
const store = useDefectStore()
const { current, loaded } = storeToRefs(store)
const { snackbar, notify } = useSnackbar()
const { busy: saving, run } = useAsyncAction()

onMounted(() => run(() => store.ensureLoaded()))

const stats = computed(() => {
  const open = current.value.filter(isOpenDefect)
  return [
    { label: 'Defect ที่ยังเปิดอยู่', value: open.length, icon: 'tabler:bug', tone: 'error' as Tone },
    {
      label: 'Critical / Major ที่เปิดอยู่',
      value: open.filter((d) => d.severity === 'critical' || d.severity === 'major').length,
      icon: 'tabler:alert-octagon',
      tone: 'caution' as Tone,
    },
    { label: 'รอ QA ทดสอบซ้ำ', value: current.value.filter((d) => d.status === 'retest').length, icon: 'tabler:refresh', tone: 'warning' as Tone },
    { label: 'ปิดแล้ว', value: current.value.filter((d) => d.status === 'closed').length, icon: 'tabler:circle-check', tone: 'success' as Tone },
  ]
})

// --- filters -----------------------------------------------------------------
const search = ref('')
const status = ref<DefectStatus | 'OPEN' | null>('OPEN')
const severity = ref<DefectSeverity | null>(null)
const statusFilters = [{ value: 'OPEN', label: 'ยังไม่ปิดทั้งหมด' }, ...DEFECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))]

const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return current.value.filter(
    (d) =>
      (!q || `${d.id} ${d.title} ${d.caseId ?? ''} ${d.externalKey ?? ''} ${d.assignee ?? ''}`.toLowerCase().includes(q)) &&
      (!status.value || (status.value === 'OPEN' ? isOpenDefect(d) : d.status === status.value)) &&
      (!severity.value || d.severity === severity.value),
  )
})

const page = ref(1)
const itemsPerPage = ref(10)
watch([search, status, severity], () => (page.value = 1))

const headers = [
  { title: 'Defect', key: 'title' },
  { title: 'Severity', key: 'severity', width: 130 },
  { title: 'สถานะ', key: 'status', width: 170 },
  { title: 'ผู้รับผิดชอบ', key: 'assignee', width: 150 },
  { title: 'อัปเดต', key: 'updatedAt', width: 140 },
] as const

// --- create / edit / detail ------------------------------------------------------------
const dialog = ref(false)
const editing = ref<Defect | null>(null)
const detail = ref<Defect | null>(null)
const openRow = (_e: unknown, row: { item: Defect }) => (detail.value = row.item)
const comment = ref('')

function openCreate() {
  editing.value = null
  dialog.value = true
}

function openEdit(d: Defect) {
  editing.value = d
  dialog.value = true
}

function onSave(input: DefectInput) {
  run(
    () => store.save(input),
    (saved) => {
      dialog.value = false
      if (detail.value?.id === saved.id) detail.value = saved
      notify(input.id ? `บันทึก ${saved.id} แล้ว` : `รายงาน ${saved.id} แล้ว`)
    },
  )
}

// closing / rejecting is a verdict (defect.resolve); the other steps are progress updates (defect.report)
const canSetDefectStatus = (s: DefectStatus) => auth.can(s === 'closed' || s === 'rejected' ? 'defect.resolve' : 'defect.report')

function setStatus(d: Defect, s: DefectStatus) {
  run(
    () => store.setStatus(d, s),
    () => {
      detail.value = store.defects.find((x) => x.id === d.id) ?? null
      notify(`${d.id} → ${defectStatusOf(s).label}`)
    },
  )
}

function addComment() {
  const d = detail.value
  if (!d || !comment.value.trim()) return
  run(
    () => store.comment(d.id, comment.value.trim()),
    () => {
      comment.value = ''
      detail.value = store.defects.find((x) => x.id === d.id) ?? null
    },
  )
}

// deep link: /defects?id=BUG-001
watch(
  [() => route.query.id, loaded],
  ([id, isLoaded]) => {
    if (!isLoaded || typeof id !== 'string') return
    detail.value = store.defects.find((d) => d.id === id) ?? null
    router.replace({ query: {} })
  },
  { immediate: true },
)
</script>

<template>
  <FoxPageHeader sticky title="Defects" :breadcrumbs="[{ title: 'Defects' }]">
    <template #actions>
      <v-btn v-if="auth.can('defect.report')" color="error" prepend-icon="tabler:bug" @click="openCreate">รายงาน Defect</v-btn>
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
      <div class="fox-card-body">
        <v-row dense class="row-gap-3 align-center">
          <v-col cols="12" md="5">
            <v-text-field
              v-model="search"
              density="compact"
              placeholder="ค้นหารหัส หัวข้อ Test Case หรือ Jira key"
              prepend-inner-icon="tabler:search"
              aria-label="ค้นหา Defect"
              clearable
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-select
              v-model="status"
              :items="statusFilters"
              item-title="label"
              item-value="value"
              density="compact"
              placeholder="ทุกสถานะ"
              aria-label="สถานะ"
              clearable
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-select
              v-model="severity"
              :items="SEVERITIES"
              item-title="label"
              item-value="value"
              density="compact"
              placeholder="ทุก Severity"
              aria-label="Severity"
              clearable
            />
          </v-col>
        </v-row>
      </div>
      <v-divider />

      <v-data-table
        v-model:page="page"
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="filtered"
        item-value="id"
        @click:row="openRow"
      >
        <template #[`item.title`]="{ item }">
          <div class="py-3 defect-row">
            <div class="text-subtitle-2">
              <span class="text-error fox-num mr-1">{{ item.id }}</span
              >{{ item.title }}
            </div>
            <div class="d-flex flex-wrap ga-2 text-caption text-muted">
              <span v-if="item.caseId"
                >{{ item.caseId }}<template v-if="item.caseDeleted"> (ลบแล้ว)</template
                ><template v-if="item.stepNumber"> · ขั้นตอน {{ item.stepNumber }}</template></span
              >
              <span v-if="item.externalKey"><v-icon icon="tabler:external-link" size="12" /> {{ item.externalKey }}</span>
            </div>
          </div>
        </template>
        <template #[`item.severity`]="{ item }">
          <v-chip :color="severityOf(item.severity).tone" :prepend-icon="severityOf(item.severity).icon" size="small" variant="tonal">{{
            severityOf(item.severity).label
          }}</v-chip>
        </template>
        <template #[`item.status`]="{ item }">
          <v-chip :color="defectStatusOf(item.status).tone" :prepend-icon="defectStatusOf(item.status).icon" size="small" variant="flat">{{
            defectStatusOf(item.status).label
          }}</v-chip>
        </template>
        <template #[`item.assignee`]="{ item }">
          <span class="text-no-wrap">{{ item.assignee ? firstName(item.assignee) : '-' }}</span>
        </template>
        <template #[`item.updatedAt`]="{ item }">
          <span class="text-caption text-muted text-no-wrap">{{ formatRelative(item.updatedAt) }}</span>
        </template>
        <template #no-data>
          <FoxEmptyState icon="tabler:bug-off" title="ไม่พบ Defect" text="ลองเปลี่ยนตัวกรอง หรือรายงานจากหน้าทดสอบเมื่อพบขั้นตอนที่ไม่ผ่าน" />
        </template>
        <template #bottom>
          <v-divider />
          <FoxTablePagination v-model:page="page" v-model:items-per-page="itemsPerPage" :total="filtered.length" class="fox-card-body py-3" />
        </template>
      </v-data-table>
    </v-card>
  </div>

  <!-- detail -->
  <v-navigation-drawer
    :model-value="!!detail"
    location="end"
    width="460"
    temporary
    class="fox-aside"
    @update:model-value="(v) => !v && (detail = null)"
  >
    <template v-if="detail">
      <div class="defect-head">
        <span class="text-h5 text-error fox-num">{{ detail.id }}</span>
        <div>
          <v-btn v-if="auth.can('defect.report')" icon="tabler:pencil" variant="text" size="small" aria-label="แก้ไข" @click="openEdit(detail)" />
          <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="detail = null" />
        </div>
      </div>
      <section class="defect-section">
        <h3 class="text-h6 mb-2">{{ detail.title }}</h3>
        <div class="d-flex flex-wrap ga-2 mb-4">
          <v-chip :color="severityOf(detail.severity).tone" :prepend-icon="severityOf(detail.severity).icon" size="small" variant="tonal">{{
            severityOf(detail.severity).label
          }}</v-chip>
          <v-menu>
            <template #activator="{ props }">
              <v-chip
                v-bind="props"
                :color="defectStatusOf(detail.status).tone"
                :prepend-icon="defectStatusOf(detail.status).icon"
                append-icon="tabler:chevron-down"
                size="small"
                variant="flat"
              >
                {{ defectStatusOf(detail.status).label }}
              </v-chip>
            </template>
            <v-list>
              <v-list-item
                v-for="s in DEFECT_STATUSES"
                :key="s.value"
                :prepend-icon="s.icon"
                :title="s.label"
                :subtitle="s.hint"
                :base-color="s.tone"
                :active="s.value === detail.status"
                :disabled="saving || !canSetDefectStatus(s.value)"
                @click="setStatus(detail, s.value)"
              />
            </v-list>
          </v-menu>
          <v-chip v-if="detail.externalKey" size="small" variant="outlined" prepend-icon="tabler:external-link">{{ detail.externalKey }}</v-chip>
        </div>
        <dl class="defect-meta text-body-2">
          <dt>Test Case</dt>
          <dd>
            <template v-if="detail.caseId && detail.caseDeleted">{{ detail.caseId }} (ลบแล้ว)</template>
            <router-link
              v-else-if="detail.caseId"
              :to="{ path: '/test-cases', query: { caseId: detail.caseId } }"
              class="text-primary text-decoration-none"
              >{{ detail.caseId }}</router-link
            >
            <template v-else>-</template>
            <template v-if="detail.stepNumber"> · ขั้นตอน {{ detail.stepNumber }}</template>
          </dd>
          <dt>ผู้รับผิดชอบ</dt>
          <dd>{{ detail.assignee || '-' }}</dd>
          <dt>ผู้รายงาน</dt>
          <dd>{{ detail.reportedBy }}</dd>
          <dt>Environment</dt>
          <dd>{{ detail.environment || '-' }}</dd>
          <dt>รายงานเมื่อ</dt>
          <dd>{{ formatDateTime(detail.createdAt) }}</dd>
        </dl>
      </section>
      <v-divider />
      <section class="defect-section">
        <div class="text-overline text-muted">ขั้นตอนการทำซ้ำ</div>
        <p class="text-body-2 defect-pre">{{ detail.stepsToReproduce || '-' }}</p>
        <div class="text-overline text-muted">ผลที่คาดหวัง</div>
        <p class="text-body-2">{{ detail.expected || '-' }}</p>
        <div class="text-overline text-muted">ผลที่เกิดขึ้นจริง</div>
        <p class="text-body-2 text-error">{{ detail.actual || '-' }}</p>
        <p v-if="detail.description" class="text-body-2 text-muted mb-0">{{ detail.description }}</p>
        <div v-if="detail.evidence.length" class="defect-shots mt-3">
          <v-img v-for="(img, i) in detail.evidence" :key="i" :src="img" aspect-ratio="1.33" cover class="rounded" />
        </div>
      </section>
      <v-divider />
      <section class="defect-section">
        <div class="text-overline text-muted mb-2">ความคิดเห็น ({{ detail.comments.length }})</div>
        <div class="d-flex flex-column ga-3 mb-4">
          <div v-for="(c, i) in detail.comments" :key="i">
            <div class="text-subtitle-2">
              {{ firstName(c.by) }} <span class="text-caption text-muted">· {{ formatRelative(c.at) }}</span>
            </div>
            <div class="text-body-2">{{ c.text }}</div>
          </div>
        </div>
        <template v-if="auth.can('defect.report')">
          <v-textarea v-model="comment" rows="2" auto-grow placeholder="เพิ่มความคิดเห็น" aria-label="ความคิดเห็น" />
          <div class="d-flex justify-end mt-2">
            <v-btn color="primary" size="small" :loading="saving" :disabled="!comment.trim()" @click="addComment">ส่ง</v-btn>
          </div>
        </template>
      </section>
    </template>
  </v-navigation-drawer>

  <DefectDialog v-model="dialog" :defect="editing" :loading="saving" @save="onSave" />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.defect-row {
  cursor: pointer;
}

.defect-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding-inline: 20px 12px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.defect-section {
  padding: 20px;
}

.defect-meta {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 6px 12px;
  margin: 0;
}

.defect-meta dt {
  color: rgb(var(--v-theme-muted));
}

.defect-meta dd {
  margin: 0;
}

.defect-pre {
  white-space: pre-line;
}

.defect-shots {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
</style>
