<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxCardHeader from '@/components/ui/FoxCardHeader.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxTimeline from '@/components/ui/FoxTimeline.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import FoxDonutChart from '@/components/charts/FoxDonutChart.vue'
import FoxChartLegend from '@/components/charts/FoxChartLegend.vue'
import ProjectCard from '@/components/projects/ProjectCard.vue'
import ProjectDialog from '@/components/projects/ProjectDialog.vue'
import TodoCard from '@/components/layout/TodoCard.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { auditActionOf } from '@/services/audit.service'
import { PROJECT_STATUSES } from '@/services/project.service'
import { STATUSES, isDueSoon, isOverdue } from '@/services/test-case.service'
import { useAuditStore } from '@/stores/audit.store'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { Project, ProjectInput, ProjectStatus, TimelineItem } from '@/types'
import { formatTime } from '@/utils/date'
import { firstName, formatPercent } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const { projects, selectedProjectId, overallStats, currentProject, currentStats } = storeToRefs(projectStore)
const { activeCases: testCases } = storeToRefs(useTestCaseStore())
const auth = useAuthStore()
const { currentUser, users } = storeToRefs(auth)
const canSeeAudit = computed(() => auth.can('audit.view'))
const admins = computed(() => users.value.filter((u) => auth.roleById(u.roleId)?.builtIn === 'admin').map((u) => u.name).join(', '))
const { sortedLogs } = storeToRefs(useAuditStore())
const { snackbar, notify } = useSnackbar()
const { busy: saving, run } = useAsyncAction()

// --- stats -------------------------------------------------------------------
const urgentCount = computed(() => testCases.value.filter((tc) => isOverdue(tc) || isDueSoon(tc)).length)
const stats = computed(() => [
  { label: 'โปรเจกต์ทั้งหมด', value: overallStats.value.totalProjects, icon: 'tabler:folders', tone: 'primary' as const },
  { label: 'Test Cases ทั้งหมด', value: overallStats.value.totalTestCases, icon: 'tabler:flask', tone: 'info' as const },
  { label: 'Pass Rate เฉลี่ย', value: formatPercent(overallStats.value.passRate), icon: 'tabler:circle-check', tone: 'success' as const },
  { label: 'ใกล้ครบกำหนด / เลยกำหนด', value: urgentCount.value, icon: 'tabler:clock-exclamation', tone: 'error' as const },
])

const statusSegments = computed(() =>
  STATUSES.map((s) => ({ label: s.label, value: currentStats.value.byStatus[s.value], tone: s.tone })).filter((s) => s.value > 0),
)

const activities = computed<TimelineItem[]>(() =>
  sortedLogs.value.slice(0, 6).map((log) => ({
    time: formatTime(log.timestamp),
    text: `${auditActionOf(log.action).label}: ${log.targetTitle}`,
    tone: auditActionOf(log.action).tone,
  })),
)

// --- filters -----------------------------------------------------------------
const search = ref('')
const status = ref<ProjectStatus | null>(null)

const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return projects.value.filter(
    (p) =>
      (!q || `${p.name} ${p.key} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(q)) &&
      (!status.value || p.status === status.value),
  )
})

function resetFilters() {
  search.value = ''
  status.value = null
}

// --- create / edit / delete ---------------------------------------------------
const dialog = ref(false)
const editing = ref<Project | null>(null)
const confirm = ref(false)
const deleting = ref<Project | null>(null)

function openCreate() {
  editing.value = null
  dialog.value = true
}

function openEdit(p: Project) {
  editing.value = p
  dialog.value = true
}

function onSave(input: ProjectInput) {
  run(
    () => projectStore.save(input),
    () => {
      dialog.value = false
      notify(input.id ? 'บันทึกการแก้ไขแล้ว' : 'สร้างโปรเจกต์แล้ว')
    },
  )
}

function askDelete(p: Project) {
  deleting.value = p
  confirm.value = true
}

function onDelete() {
  const target = deleting.value
  if (!target) return
  run(() => projectStore.remove(target.id), () => notify(`ลบ ${target.name} แล้ว`))
}

function openProject(id: string) {
  projectStore.select(id)
  router.push('/test-cases')
}

function exportProject(id?: string) {
  const file = projectStore.exportMarkdown(id)
  if (file) notify(`ดาวน์โหลด ${file} แล้ว`)
}

// the project switcher links here with ?action=new-project
watch(
  () => route.query.action,
  (action) => {
    if (action !== 'new-project') return
    if (auth.isAdmin) openCreate()
    router.replace({ query: {} })
  },
  { immediate: true },
)
</script>

<template>
  <FoxPageHeader :eyebrow="`ยินดีต้อนรับ คุณ${firstName(currentUser.name)}`" title="ภาพรวมโปรเจกต์">
    <template #actions>
      <v-btn v-if="auth.can('case.view') && projects.length" variant="outlined" prepend-icon="tabler:markdown" @click="exportProject()">ส่งออก .md</v-btn>
      <v-btn v-if="auth.isAdmin" color="primary" prepend-icon="tabler:plus" @click="openCreate">สร้างโปรเจกต์</v-btn>
    </template>
  </FoxPageHeader>

  <!-- a new user without a role: only the dashboard and settings until an Admin assigns one -->
  <v-card v-if="!auth.hasRole" class="fox-card-body">
    <FoxEmptyState icon="tabler:user-question" title="บัญชีของคุณยังไม่มี Role" text="ผู้ดูแลระบบ (Admin) จะกำหนด Role และทีมให้ จากนั้นคุณจะเห็นโปรเจกต์และเมนูตามสิทธิ์ ระหว่างนี้เปิดได้เฉพาะภาพรวมและตั้งค่า">
      <div class="text-body-2 text-muted mt-3">Admin: {{ admins || '-' }}</div>
      <v-btn class="mt-3" variant="tonal" color="primary" prepend-icon="tabler:settings" to="/settings">ไปที่ตั้งค่า</v-btn>
    </FoxEmptyState>
  </v-card>

  <div v-else class="fox-stack">
    <v-row class="fox-grid">
      <v-col v-for="s in stats" :key="s.label" cols="12" sm="6" lg="3">
        <FoxStatCard v-bind="s" />
      </v-col>
    </v-row>

    <!-- to-do, current project status, recent activity -->
    <v-row class="fox-grid">
      <v-col cols="12" lg="4">
        <TodoCard />
      </v-col>
      <v-col cols="12" :md="canSeeAudit ? 5 : 12" :lg="canSeeAudit ? 4 : 8">
        <v-card class="fox-card-body h-100">
          <FoxCardHeader title="สถานะการทดสอบ" :subtitle="currentProject?.name ?? '-'" />
          <v-divider class="my-5" />
          <template v-if="currentStats.total">
            <FoxDonutChart :segments="statusSegments" :size="200" :thickness="26">
              <span class="text-h3 fox-num">{{ formatPercent(currentStats.passRate, 0) }}</span>
              <span class="text-caption text-muted">ผ่านแล้ว</span>
            </FoxDonutChart>
            <FoxChartLegend class="justify-center mt-6" :items="statusSegments" />
          </template>
          <FoxEmptyState v-else icon="tabler:flask" title="ยังไม่มี Test Case" text="เริ่มสร้าง Test Case แรกของโปรเจกต์นี้" />
        </v-card>
      </v-col>
      <v-col v-if="canSeeAudit" cols="12" md="7" lg="4">
        <v-card class="fox-card-body h-100">
          <FoxCardHeader title="กิจกรรมล่าสุด" subtitle="จาก Audit Trail">
            <v-btn variant="text" color="primary" size="small" append-icon="tabler:arrow-right" to="/audit-trail">ดูทั้งหมด</v-btn>
          </FoxCardHeader>
          <FoxTimeline v-if="activities.length" :items="activities" class="mt-6" />
          <FoxEmptyState v-else icon="tabler:history" title="ยังไม่มีกิจกรรม" />
        </v-card>
      </v-col>
    </v-row>
    <!-- projects -->
    <v-card>
      <div class="fox-card-body">
        <v-row dense class="row-gap-3 align-center">
          <v-col cols="12" md="5" lg="4">
            <v-text-field
              v-model="search"
              density="compact"
              placeholder="ค้นหาชื่อ, Key หรือ Tag"
              prepend-inner-icon="tabler:search"
              aria-label="ค้นหาโปรเจกต์"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="status"
              :items="PROJECT_STATUSES"
              item-title="label"
              item-value="value"
              density="compact"
              placeholder="ทุกสถานะ"
              aria-label="สถานะโปรเจกต์"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="4" lg="5" class="text-sm-end">
            <span class="text-body-2 text-muted">แสดง {{ filtered.length }} จาก {{ projects.length }} โปรเจกต์</span>
          </v-col>
        </v-row>
      </div>
    </v-card>

    <v-row v-if="filtered.length" class="fox-grid">
      <v-col v-for="p in filtered" :key="p.id" cols="12" md="6" xl="4">
        <ProjectCard
          :project="p"
          :selected="p.id === selectedProjectId"
          @select="projectStore.select"
          @open="openProject"
          @edit="openEdit"
          @delete="askDelete"
          @export="exportProject"
        />
      </v-col>
    </v-row>
    <v-card v-else>
      <FoxEmptyState
        icon="tabler:folder-search"
        :title="projects.length ? 'ไม่พบโปรเจกต์' : 'ยังไม่มีโปรเจกต์ที่คุณเข้าถึงได้'"
        :text="projects.length ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง' : auth.isAdmin ? 'สร้างโปรเจกต์แรก' : 'โปรเจกต์จะแสดงเมื่อ Admin เพิ่มคุณเข้าทีมของโปรเจกต์'"
      >
        <div class="d-flex ga-2 mt-3">
          <v-btn v-if="projects.length" variant="tonal" color="primary" @click="resetFilters">ล้างตัวกรอง</v-btn>
          <v-btn v-if="auth.isAdmin" color="primary" prepend-icon="tabler:plus" @click="openCreate">สร้างโปรเจกต์</v-btn>
        </div>
      </FoxEmptyState>
    </v-card>

  </div>

  <ProjectDialog v-model="dialog" :project="editing" :loading="saving" @save="onSave" />
  <FoxConfirmDialog
    v-model="confirm"
    title="ลบโปรเจกต์?"
    :text="deleting ? `โปรเจกต์ “${deleting.name}” และ Test Case ทั้งหมดจะถูกลบถาวร` : ''"
    confirm-text="ลบโปรเจกต์"
    @confirm="onDelete"
  />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
