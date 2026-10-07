import type { BackupApi } from '@/api/contract'
import type { BackupAlertTestResult, BackupJob, BackupSettings, BackupSnapshot, BackupStatus } from '@/types'
import { get, post, put } from './http'

// Backup & recovery: the backend passes these to the backup agent (Admin only).
export const backupApi: BackupApi = {
  fetchStatus: () => get<BackupStatus>('/backup/status'),
  fetchJobs: () => get<BackupJob[]>('/backup/jobs'),
  fetchJobLog: (id) => get<{ log: string }>(`/backup/jobs/${encodeURIComponent(id)}/log`).then((r) => r.log),
  startJob: (kind, snapshot) => post<BackupJob>('/backup/jobs', { kind, ...(snapshot ? { snapshot } : {}) }),
  fetchSnapshots: () => get<BackupSnapshot[]>('/backup/snapshots'),
  fetchSettings: () => get<BackupSettings>('/backup/settings'),
  saveSettings: (input) => put<BackupSettings>('/backup/settings', input),
  testAlerts: () => post<BackupAlertTestResult>('/backup/alerts/test'),
}
