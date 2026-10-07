import cron, { type ScheduledTask } from 'node-cron'
import type { BackupJob, BackupJobKind, BackupSettings, BackupSettingsInput, BackupSnapshot, BackupStatus } from '#contract/types.js'
import { type Alerter, evaluateProblems } from './alerts.js'
import type { AgentConfig } from './config.js'
import type { JobStore } from './jobs.js'
import type { Runner } from './runner.js'
import type { SettingsStore } from './settings.js'
import { diskUsage, type Storage } from './storage.js'

// The agent: runs the schedule, checks every CHECK_MINUTES what is wrong (a failed job, no successful
// backup / drill for too long, a full disk), alerts on changes, and runs a missed backup / drill once
// to catch up. The HTTP server (http.ts) is its only way in.

export const CHECK_MINUTES = 10

export class ValidationError extends Error {}

export class Agent {
  private tasks: Partial<Record<'backup' | 'drill', ScheduledTask>> = {}
  private checker: NodeJS.Timeout | null = null
  /** a catch-up already ran for this stale problem (its `since`) */
  private caughtUp: Partial<Record<'backup' | 'drill', string>> = {}

  constructor(
    readonly config: AgentConfig,
    readonly settings: SettingsStore,
    readonly jobs: JobStore,
    readonly runner: Runner,
    readonly storage: Storage,
    readonly alerter: Alerter,
    private readonly log: (line: string) => void = (line) => console.log(line),
  ) {}

  start(): void {
    this.schedule()
    this.checker = setInterval(() => void this.check(), CHECK_MINUTES * 60_000)
    void this.check()
  }

  stop(): void {
    for (const task of Object.values(this.tasks)) void task?.stop()
    this.tasks = {}
    if (this.checker) clearInterval(this.checker)
    this.checker = null
  }

  /** (re)creates the cron tasks from the settings */
  schedule(): void {
    for (const task of Object.values(this.tasks)) void task?.stop()
    this.tasks = {}
    for (const kind of ['backup', 'drill'] as const) {
      const entry = this.settings.raw.schedule[kind]
      if (!entry.enabled) continue
      this.tasks[kind] = cron.schedule(entry.cron, () => this.startQuietly(kind, 'schedule'), {
        timezone: this.config.timezone,
        name: `backup-${kind}`,
      })
    }
  }

  private startQuietly(kind: BackupJobKind, trigger: 'schedule' | 'catch-up'): void {
    try {
      this.runner.start(kind, trigger)
      this.log(`[agent] ${kind} started (${trigger})`)
    } catch (err) {
      this.log(`[agent] ${kind} (${trigger}) not started: ${(err as Error).message}`)
    }
  }

  /** a job finished: Kuma hears every result, problems are re-checked at once */
  async jobFinished(job: BackupJob): Promise<void> {
    this.log(`[agent] ${job.kind} ${job.result}: ${job.summary}`)
    await this.alerter.pushKuma(job)
    await this.check()
  }

  /** what is wrong now; alerts on changes; a stale backup / drill gets one catch-up run */
  async check(): Promise<void> {
    try {
      const disk = await diskUsage(this.config.dataDir).catch(() => undefined)
      const problems = await this.alerter.sync(
        evaluateProblems({ jobs: this.jobs, settings: this.settings.raw, diskLimitPercent: this.config.diskLimitPercent, ...(disk ? { disk } : {}) }),
      )
      for (const kind of ['backup', 'drill'] as const) {
        const stale = problems.find((p) => p.key === `stale-${kind}`)
        if (stale && this.caughtUp[kind] !== stale.since && !this.runner.busy) {
          this.caughtUp[kind] = stale.since
          this.startQuietly(kind, 'catch-up')
        }
      }
      this.jobs.prune()
    } catch (err) {
      this.log(`[agent] check failed: ${(err as Error).message}`)
    }
  }

  async status(): Promise<BackupStatus> {
    const disk = await diskUsage(this.config.dataDir).catch(() => undefined)
    const nextRuns: BackupStatus['nextRuns'] = {}
    for (const kind of ['backup', 'drill'] as const) {
      const next = this.tasks[kind]?.getNextRun()
      if (next) nextRuns[kind] = next.toISOString()
    }
    const running = this.jobs.running()
    const lastBackup = this.jobs.last('backup')
    const lastVerify = this.jobs.last('verify')
    const lastDrill = this.jobs.last('drill')
    return {
      reachable: true,
      ...(running ? { running } : {}),
      ...(lastBackup ? { lastBackup } : {}),
      ...(lastVerify ? { lastVerify } : {}),
      ...(lastDrill ? { lastDrill } : {}),
      nextRuns,
      ...(disk ? { disk } : {}),
      destinations: await this.storage.destinations(),
      problems: Object.values(this.settings.raw.problems),
    }
  }

  snapshots(): Promise<BackupSnapshot[]> {
    return this.storage.snapshots()
  }

  startJob(kind: BackupJobKind, startedBy?: string, snapshot?: string): BackupJob {
    if (snapshot !== undefined && (kind !== 'drill' || !/^[\w.-]+-\d{8}-\d{6}\.archive\.gz$/.test(snapshot))) {
      throw new ValidationError('snapshot ใช้กับการซ้อมกู้ และต้องเป็นชื่อไฟล์ dump')
    }
    return this.runner.start(kind, 'manual', { ...(startedBy ? { startedBy } : {}), ...(snapshot ? { snapshot } : {}) })
  }

  viewSettings(): BackupSettings {
    return this.settings.view()
  }

  updateSettings(input: BackupSettingsInput): BackupSettings {
    for (const kind of ['backup', 'drill'] as const) {
      const entry = input.schedule?.[kind]
      if (!entry || typeof entry.enabled !== 'boolean' || !cron.validate(String(entry.cron))) {
        throw new ValidationError(`ตารางเวลา${kind === 'backup' ? 'สำรอง' : 'ซ้อมกู้'}ไม่ถูกต้อง (cron: นาที ชั่วโมง วัน เดือน วันในสัปดาห์)`)
      }
      if (!Number.isInteger(entry.staleAfterHours) || entry.staleAfterHours < 1 || entry.staleAfterHours > 24 * 60) {
        throw new ValidationError('ชั่วโมงที่ถือว่าขาดรอบต้องเป็น 1 - 1440')
      }
    }
    const alerts = input.alerts
    if (!alerts || !Array.isArray(alerts.teamIds) || !Array.isArray(alerts.extraEmails)) throw new ValidationError('ตั้งค่าการแจ้งเตือนไม่ครบ')
    const badEmail = alerts.extraEmails.find((e) => typeof e !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (badEmail !== undefined) throw new ValidationError(`อีเมลไม่ถูกต้อง: ${String(badEmail)}`)
    for (const name of ['teamsWebhookUrl', 'kumaBackupUrl', 'kumaDrillUrl'] as const) {
      const value = alerts[name]
      if (typeof value === 'string' && value && !/^https?:\/\/\S+$/.test(value)) throw new ValidationError(`URL ไม่ถูกต้อง (${name})`)
    }
    if (alerts.teamsEnabled && !alerts.teamsWebhookUrl && alerts.teamsWebhookUrl !== undefined) {
      throw new ValidationError('เปิดแจ้งเตือน Teams ต้องมี webhook URL')
    }
    const view = this.settings.update({
      schedule: { backup: input.schedule.backup, drill: input.schedule.drill },
      alerts: {
        emailEnabled: !!alerts.emailEnabled,
        teamIds: alerts.teamIds.map(String),
        extraEmails: alerts.extraEmails.map((e) => String(e).toLowerCase()),
        teamsEnabled: !!alerts.teamsEnabled,
        ...(alerts.teamsWebhookUrl !== undefined ? { teamsWebhookUrl: alerts.teamsWebhookUrl } : {}),
        ...(alerts.kumaBackupUrl !== undefined ? { kumaBackupUrl: alerts.kumaBackupUrl } : {}),
        ...(alerts.kumaDrillUrl !== undefined ? { kumaDrillUrl: alerts.kumaDrillUrl } : {}),
      },
    })
    this.schedule()
    return view
  }

  /** a test message to Teams (and through the API to the Admins and the email recipients) */
  async testAlerts(): Promise<{ teams: boolean; emails: number; errors: string[] }> {
    const result = await this.alerter.announce({
      state: 'test',
      key: 'test',
      title: 'ทดสอบการแจ้งเตือน',
      message: 'ข้อความทดสอบจากหน้าสำรองข้อมูล ถ้าเห็นข้อความนี้ ช่องทางนี้ใช้ได้',
      severity: 'info',
    })
    return result
  }
}
