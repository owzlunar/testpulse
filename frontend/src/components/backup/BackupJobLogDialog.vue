<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { BACKUP_JOB_TRIGGERS, backupJobKindOf, backupJobResultOf } from '@/domain/backup'
import { useBackupStore } from '@/stores/backup.store'
import type { BackupJob } from '@/types'
import { formatDateTime } from '@/utils/date'

// A job's full output (the scripts' lines), reloaded while the job still runs
const open = defineModel<boolean>({ default: false })
const props = defineProps<{ job: BackupJob | null }>()

const store = useBackupStore()
const log = ref('')
const { busy, run } = useAsyncAction()

const kind = computed(() => (props.job ? backupJobKindOf(props.job.kind) : null))
const result = computed(() => (props.job ? backupJobResultOf(props.job.result) : null))

function reload() {
  const job = props.job
  if (job)
    run(
      () => store.fetchLog(job.id),
      (text) => (log.value = text),
    )
}

watch(
  () => [open.value, props.job?.id, props.job?.result],
  () => {
    if (open.value) reload()
    else log.value = ''
  },
  { immediate: true },
)

function download() {
  if (!props.job) return
  const url = URL.createObjectURL(new Blob([log.value], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.job.id}.log`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <v-dialog v-model="open" max-width="900">
    <v-card v-if="job && kind && result">
      <div class="d-flex align-center ga-3 fox-card-body pb-0">
        <v-avatar :color="kind.tone" size="40" variant="tonal"><v-icon :icon="kind.icon" /></v-avatar>
        <div class="flex-grow-1 overflow-hidden">
          <h2 class="text-h5">{{ kind.label }}</h2>
          <div class="text-body-2 text-muted">
            {{ formatDateTime(job.startedAt) }} · {{ BACKUP_JOB_TRIGGERS[job.trigger]
            }}<template v-if="job.startedBy"> · {{ job.startedBy }}</template>
          </div>
        </div>
        <v-chip :color="result.tone" :prepend-icon="result.icon" size="small" variant="tonal">{{ result.label }}</v-chip>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <p v-if="job.summary" class="text-body-1 mb-3">{{ job.summary }}</p>
        <pre class="fox-log" aria-label="log ของงาน">{{ log || (busy ? 'กำลังโหลด…' : 'ยังไม่มี log') }}</pre>
      </v-card-text>
      <v-divider />
      <div class="d-flex justify-end ga-3 fox-card-body py-4">
        <v-btn variant="outlined" prepend-icon="tabler:refresh" :loading="busy" @click="reload">โหลดใหม่</v-btn>
        <v-btn variant="outlined" prepend-icon="tabler:download" :disabled="!log" @click="download">ดาวน์โหลด log</v-btn>
        <v-btn color="primary" @click="open = false">ปิด</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
