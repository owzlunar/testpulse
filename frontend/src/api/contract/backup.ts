import type { BackupAlertTestResult, BackupJob, BackupJobKind, BackupSettings, BackupSettingsInput, BackupSnapshot, BackupStatus } from '@/types'

// Backup & recovery (PRD 5.15): what the backup agent does, run and set up from the web app. Admin only.
export interface BackupApi {
  /** GET /backup/status (reachable: false when the agent does not answer) */
  fetchStatus(): Promise<BackupStatus>

  /** GET /backup/jobs (newest first, the last 90 days) */
  fetchJobs(): Promise<BackupJob[]>

  /** GET /backup/jobs/:id/log → { log } (the job's full output) */
  fetchJobLog(id: string): Promise<string>

  /**
   * POST /backup/jobs
   * Body: { kind, snapshot? } (snapshot: the one a drill restores, default the newest) → the job, started.
   * 409 while another job runs.
   */
  startJob(kind: BackupJobKind, snapshot?: string): Promise<BackupJob>

  /** GET /backup/snapshots (newest first) */
  fetchSnapshots(): Promise<BackupSnapshot[]>

  /** GET /backup/settings */
  fetchSettings(): Promise<BackupSettings>

  /** PUT /backup/settings */
  saveSettings(input: BackupSettingsInput): Promise<BackupSettings>

  /** POST /backup/alerts/test (a test message to every channel that is on) */
  testAlerts(): Promise<BackupAlertTestResult>
}
