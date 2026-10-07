<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import BackupDrillDialog from '@/components/backup/BackupDrillDialog.vue'
import BackupJobLogDialog from '@/components/backup/BackupJobLogDialog.vue'
import BackupSettingsDialog from '@/components/backup/BackupSettingsDialog.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { BACKUP_JOB_TRIGGERS, backupJobKindOf, backupJobResultOf, describeSchedule, formatBytes } from '@/domain/backup'
import { POLL_MS, useBackupStore } from '@/stores/backup.store'
import type { BackupJob, BackupJobKind, BackupSettingsInput } from '@/types'
import { formatDateTime, formatRelative } from '@/utils/date'

// Backup & recovery (Admin only, PRD 5.15): what the backup agent did and will do, run a job now, pick a
// snapshot for a restore drill, schedules and alerts. Restoring the live system stays on the command line.
const store = useBackupStore()
const { status, jobs, snapshots, settings, loaded, running } = storeToRefs(store)
const { snackbar, notify } = useSnackbar()
const { busy: starting, run } = useAsyncAction()
const { busy: saving, run: runSave } = useAsyncAction()
const { busy: testing, run: runTest } = useAsyncAction()

onMounted(() => run(() => store.load()))

// poll while a job runs
let timer: ReturnType<typeof setInterval> | null = null
watch(
  running,
  (job) => {
    if (job && !timer) timer = setInterval(() => void store.refresh().catch(() => {}), POLL_MS)
    if (!job && timer) {
      clearInterval(timer)
      timer = null
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => timer && clearInterval(timer))

const finished = ref<string | null>(null)
watch(running, (job, before) => {
  if (!job && before) {
    const done = jobs.value.find((j) => j.id === before.id)
    if (done) notify(`${backupJobKindOf(done.kind).label}: ${backupJobResultOf(done.result).label}`, done.result === 'failed' ? 'error' : 'success')
    finished.value = before.id
  }
})

function start(kind: BackupJobKind, snapshot?: string) {
  run(
    () => store.start(kind, snapshot),
    (job) => {
      drillOpen.value = false
      notify(`เริ่ม${backupJobKindOf(job.kind).label}แล้ว`)
    },
  )
}

const drillOpen = ref(false)
const drillSnapshot = ref<string | null>(null)
function openDrill(snapshot: string | null = null) {
  drillSnapshot.value = snapshot
  drillOpen.value = true
}

const logOpen = ref(false)
const logJobId = ref<string | null>(null)
const logJob = computed<BackupJob | null>(() => jobs.value.find((j) => j.id === logJobId.value) ?? null)
function openLog(job: BackupJob) {
  logJobId.value = job.id
  logOpen.value = true
}

const settingsOpen = ref(false)
function onSave(input: BackupSettingsInput) {
  runSave(
    () => store.saveSettings(input),
    () => {
      settingsOpen.value = false
      notify('บันทึกตั้งค่าการสำรองข้อมูลแล้ว')
    },
  )
}
function onTest() {
  runTest(
    () => store.testAlerts(),
    (r) => {
      const sent = [r.teams && 'Teams', r.emails && `อีเมล ${r.emails} ฉบับ`, 'ในระบบ'].filter(Boolean).join(', ')
      notify(r.errors.length ? `ส่งไม่ครบ: ${r.errors.join(', ')}` : `ส่งข้อความทดสอบแล้ว (${sent})`, r.errors.length ? 'error' : 'success')
    },
  )
}

const lastOf = (job: BackupJob | undefined) => (job?.finishedAt ? formatRelative(job.finishedAt) : '-')
const resultLabel = (job: BackupJob | undefined) => (job ? backupJobResultOf(job.result).label : 'ยังไม่เคยทำ')
const resultTone = (job: BackupJob | undefined) => (job ? backupJobResultOf(job.result).tone : 'secondary')
const diskTone = computed(() => ((status.value?.disk?.usedPercent ?? 0) > 80 ? 'error' : 'success'))

const jobHeaders = [
  { title: 'เริ่ม', key: 'startedAt', width: 150 },
  { title: 'งาน', key: 'kind', width: 150 },
  { title: 'ผล', key: 'result', width: 160 },
  { title: 'สรุป', key: 'summary', sortable: false },
  { title: 'โดย', key: 'trigger', width: 170 },
  { title: '', key: 'actions', sortable: false, width: 56 },
]
const snapshotHeaders = [
  { title: 'Snapshot', key: 'name' },
  { title: 'เวลา', key: 'createdAt', width: 150 },
  { title: 'ขนาด', key: 'sizeBytes', width: 100 },
  { title: 'อยู่ที่', key: 'where', sortable: false, width: 190 },
  { title: 'ลบไม่ได้จนถึง', key: 'lockedUntil', width: 150 },
  { title: '', key: 'actions', sortable: false, width: 120 },
]
</script>

<template>
  <FoxPageHeader sticky :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'สำรองข้อมูล' }]">
    <template #actions>
      <v-btn variant="outlined" prepend-icon="tabler:settings" :disabled="!status?.reachable" @click="settingsOpen = true">ตั้งค่า</v-btn>
      <v-btn variant="outlined" prepend-icon="tabler:database-import" :disabled="!status?.reachable || !!running" @click="openDrill()">ซ้อมกู้</v-btn>
      <v-btn
        variant="outlined"
        prepend-icon="tabler:shield-check"
        :disabled="!status?.reachable || !!running"
        :loading="starting"
        @click="start('verify')"
      >
        ตรวจ backup
      </v-btn>
      <v-btn
        color="primary"
        prepend-icon="tabler:database-export"
        :disabled="!status?.reachable || !!running"
        :loading="starting"
        @click="start('backup')"
      >
        สำรองเดี๋ยวนี้
      </v-btn>
    </template>
  </FoxPageHeader>

  <FoxPageSkeleton v-if="!loaded" :stats="4" :rows="2" />

  <div v-else class="fox-stack">
    <v-alert v-if="!status?.reachable" type="error" variant="tonal" icon="tabler:plug-connected-x">
      <div class="text-subtitle-2">ติดต่อ backup agent ไม่ได้</div>
      ยังไม่ได้เปิด agent (BACKUP_AGENT / BACKUP_AGENT_URL) หรือ agent หยุดทำงาน การสำรองตามเวลาจะไม่เกิดขึ้นจนกว่า agent จะกลับมา ดูวิธีตั้งค่าใน
      deploy/README.md
    </v-alert>

    <template v-else>
      <v-alert v-for="p in status.problems" :key="p.key" type="warning" variant="tonal" density="compact" icon="tabler:alert-triangle">
        <span class="text-subtitle-2">{{ p.message }}</span>
        <span class="text-caption text-muted ml-2">ตั้งแต่ {{ formatDateTime(p.since) }}</span>
      </v-alert>

      <v-alert v-if="running" type="info" variant="tonal" icon="tabler:loader-2">
        <div class="d-flex align-center flex-wrap ga-3">
          <span class="text-subtitle-2">กำลัง{{ backupJobKindOf(running.kind).label }}</span>
          <span class="text-body-2 text-muted"
            >เริ่ม {{ formatDateTime(running.startedAt) }}<template v-if="running.startedBy"> โดย {{ running.startedBy }}</template></span
          >
          <v-spacer />
          <v-btn size="small" variant="text" prepend-icon="tabler:file-text" @click="openLog(running)">ดู log</v-btn>
        </div>
        <v-progress-linear indeterminate color="info" class="mt-2" />
      </v-alert>

      <v-row class="fox-grid">
        <v-col cols="12" sm="6" lg="3">
          <FoxStatCard
            icon="tabler:database-export"
            :value="lastOf(status.lastBackup)"
            :label="`สำรองล่าสุด: ${resultLabel(status.lastBackup)}`"
            :tone="resultTone(status.lastBackup)"
          />
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <FoxStatCard
            icon="tabler:database-import"
            :value="lastOf(status.lastDrill)"
            :label="`ซ้อมกู้ล่าสุด: ${resultLabel(status.lastDrill)}`"
            :tone="resultTone(status.lastDrill)"
          />
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <FoxStatCard icon="tabler:stack-2" :value="snapshots.length" label="Snapshot ที่เก็บอยู่" tone="info" />
        </v-col>
        <v-col cols="12" sm="6" lg="3">
          <FoxStatCard
            icon="tabler:server"
            :value="status.disk ? `${status.disk.usedPercent}%` : '-'"
            :label="status.disk ? `disk ใช้ไป (ว่าง ${formatBytes(status.disk.freeBytes)})` : 'disk'"
            :tone="diskTone"
          />
        </v-col>
      </v-row>

      <v-card class="fox-card-body">
        <v-row class="fox-grid">
          <v-col cols="12" md="6">
            <h2 class="text-h6 mb-2">ปลายทาง</h2>
            <div class="d-flex flex-column ga-2">
              <div v-for="d in status.destinations" :key="d.id" class="d-flex align-center ga-2">
                <v-icon :icon="d.ok ? 'tabler:circle-check' : 'tabler:circle-x'" :color="d.ok ? 'success' : 'error'" />
                <span class="text-body-1">{{ d.label }}</span>
                <span v-if="!d.ok" class="text-body-2 text-error">{{ d.message }}</span>
              </div>
            </div>
          </v-col>
          <v-col cols="12" md="6">
            <h2 class="text-h6 mb-2">รอบถัดไป</h2>
            <div v-if="settings" class="d-flex flex-column ga-2 text-body-1">
              <div v-for="k in ['backup', 'drill'] as const" :key="k" class="d-flex align-center ga-2">
                <v-icon :icon="backupJobKindOf(k).icon" :color="backupJobKindOf(k).tone" />
                <span>{{ backupJobKindOf(k).label }}:</span>
                <template v-if="settings.schedule[k].enabled">
                  <span class="fox-num">{{ status.nextRuns[k] ? formatDateTime(status.nextRuns[k]!) : '-' }}</span>
                  <span class="text-body-2 text-muted">({{ describeSchedule(settings.schedule[k].cron) }})</span>
                </template>
                <span v-else class="text-muted">ปิดอยู่</span>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card>

      <v-card>
        <div class="fox-card-body pb-0"><h2 class="text-h6">ประวัติงาน</h2></div>
        <v-data-table :headers="jobHeaders" :items="jobs" item-value="id" :items-per-page="10" :sort-by="[{ key: 'startedAt', order: 'desc' }]">
          <template #[`item.startedAt`]="{ item }">
            <span class="fox-num text-no-wrap">{{ formatDateTime(item.startedAt) }}</span>
          </template>
          <template #[`item.kind`]="{ item }">
            <v-chip :color="backupJobKindOf(item.kind).tone" :prepend-icon="backupJobKindOf(item.kind).icon" size="small" variant="tonal">
              {{ backupJobKindOf(item.kind).label }}
            </v-chip>
          </template>
          <template #[`item.result`]="{ item }">
            <v-chip :color="backupJobResultOf(item.result).tone" :prepend-icon="backupJobResultOf(item.result).icon" size="small" variant="tonal">
              {{ backupJobResultOf(item.result).label }}
            </v-chip>
          </template>
          <template #[`item.summary`]="{ item }">
            <span class="text-body-2 fox-clamp-2" :class="{ 'text-primary': finished === item.id }">{{ item.summary || '-' }}</span>
          </template>
          <template #[`item.trigger`]="{ item }">
            <span class="text-body-2 text-no-wrap">{{ item.startedBy ?? BACKUP_JOB_TRIGGERS[item.trigger] }}</span>
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn
              icon="tabler:file-text"
              variant="text"
              size="small"
              :aria-label="`ดู log ของ${backupJobKindOf(item.kind).label} ${formatDateTime(item.startedAt)}`"
              @click="openLog(item)"
            />
          </template>
          <template #no-data><FoxEmptyState icon="tabler:history" title="ยังไม่มีงาน" text="งานตามเวลาและงานที่สั่งจะแสดงที่นี่" /></template>
        </v-data-table>
      </v-card>

      <v-card>
        <div class="fox-card-body pb-0">
          <h2 class="text-h6">Snapshot</h2>
          <p class="text-body-2 text-muted">
            ฐานข้อมูลที่สำรองไว้ แต่ละรายการลบไม่ได้จนถึงวันที่ล็อกหมดอายุ กู้ทับระบบจริงทำผ่าน command line ตามคู่มือ
          </p>
        </div>
        <v-data-table :headers="snapshotHeaders" :items="snapshots" item-value="name" :items-per-page="10">
          <template #[`item.name`]="{ item }">
            <span class="text-body-2 text-no-wrap">{{ item.name }}</span>
          </template>
          <template #[`item.createdAt`]="{ item }">
            <span class="fox-num text-no-wrap">{{ formatDateTime(item.createdAt) }}</span>
          </template>
          <template #[`item.sizeBytes`]="{ item }">
            <span class="fox-num">{{ formatBytes(item.sizeBytes) }}</span>
          </template>
          <template #[`item.where`]="{ item }">
            <div class="d-flex ga-1">
              <v-chip size="x-small" :color="item.local ? 'success' : 'secondary'" variant="tonal">เครื่องนี้</v-chip>
              <v-chip size="x-small" :color="item.offsite ? 'success' : 'warning'" variant="tonal">{{
                item.offsite ? 'off-site' : 'ไม่มีที่ off-site'
              }}</v-chip>
            </div>
          </template>
          <template #[`item.lockedUntil`]="{ item }">
            <span class="fox-num text-no-wrap">{{ item.lockedUntil ? formatDateTime(item.lockedUntil) : '-' }}</span>
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn size="small" variant="text" prepend-icon="tabler:database-import" :disabled="!!running" @click="openDrill(item.name)"
              >ซ้อมกู้</v-btn
            >
          </template>
          <template #no-data><FoxEmptyState icon="tabler:stack-2" title="ยังไม่มี snapshot" text='กด "สำรองเดี๋ยวนี้" หรือรอรอบตามเวลา' /></template>
        </v-data-table>
      </v-card>
    </template>
  </div>

  <BackupDrillDialog v-model="drillOpen" :snapshots="snapshots" :initial="drillSnapshot" :loading="starting" @start="(s) => start('drill', s)" />
  <BackupJobLogDialog v-model="logOpen" :job="logJob" />
  <BackupSettingsDialog v-model="settingsOpen" :settings="settings" :loading="saving" :testing="testing" @save="onSave" @test="onTest" />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
