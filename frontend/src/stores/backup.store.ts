import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { backupApi as api } from '@/api'
import type { BackupJob, BackupJobKind, BackupSettings, BackupSettingsInput, BackupSnapshot, BackupStatus } from '@/types'

// Backup & recovery (Admin only): the agent's status, jobs, snapshots and settings. While a job runs the
// page polls (refresh every POLL_MS) until it is done.

export const POLL_MS = 3000

export const useBackupStore = defineStore('backup', () => {
  const status = ref<BackupStatus | null>(null)
  const jobs = ref<BackupJob[]>([])
  const snapshots = ref<BackupSnapshot[]>([])
  const settings = ref<BackupSettings | null>(null)
  const loaded = ref(false)

  const running = computed(() => status.value?.running ?? jobs.value.find((j) => j.result === 'running') ?? null)

  /** everything the page shows; settings and lists only when the agent answers */
  async function load() {
    status.value = await api.fetchStatus()
    if (status.value.reachable) {
      ;[jobs.value, snapshots.value, settings.value] = await Promise.all([api.fetchJobs(), api.fetchSnapshots(), api.fetchSettings()])
    }
    loaded.value = true
  }

  /** after a poll tick: status and jobs (snapshots too once nothing runs any more) */
  async function refresh() {
    const wasRunning = !!running.value
    status.value = await api.fetchStatus()
    if (!status.value.reachable) return
    jobs.value = await api.fetchJobs()
    if (wasRunning && !running.value) snapshots.value = await api.fetchSnapshots()
  }

  async function start(kind: BackupJobKind, snapshot?: string): Promise<BackupJob> {
    const job = await api.startJob(kind, snapshot)
    jobs.value = [job, ...jobs.value.filter((j) => j.id !== job.id)]
    if (status.value) status.value = { ...status.value, running: job }
    return job
  }

  async function saveSettings(input: BackupSettingsInput): Promise<BackupSettings> {
    settings.value = await api.saveSettings(input)
    status.value = await api.fetchStatus()
    return settings.value
  }

  const fetchLog = (id: string) => api.fetchJobLog(id)
  const testAlerts = () => api.testAlerts()

  return { status, jobs, snapshots, settings, loaded, running, load, refresh, start, saveSettings, fetchLog, testAlerts }
})
