import type { BackupAlertTestResult, BackupJob, BackupJobKind, BackupSettings, BackupSettingsInput, BackupSnapshot, BackupStatus } from '@/types'
import { ApiError } from '@/api/errors'
import { respond } from './http'
import { assertCan } from './project'
import { STORAGE_KEYS, load, save } from './storage'
import { sessionUser } from './user'

// A stand-in for the backup agent (the backend passes these to it): jobs finish by themselves a moment
// after they start, snapshots are made up. Admin only, like the backend.

/** how long a mock job "runs" (none in unit tests) */
export const MOCK_JOB_MS = import.meta.env.MODE === 'test' ? 0 : 2500

interface BackupDb {
  jobs: BackupJob[]
  logs: Record<string, string>
  snapshots: BackupSnapshot[]
  settings: BackupSettings
  /** secrets are never sent back: only kept here to say "set" */
  teamsWebhookUrl: string | null
}

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const DAY = 24 * 3600 * 1000

function seed(): BackupDb {
  const now = Date.now()
  const snapshots: BackupSnapshot[] = [1, 2, 3].map((daysAgo) => {
    const at = new Date(now - daysAgo * DAY)
    at.setHours(2, 0, 0, 0)
    return {
      name: `testpulse-${stamp(at)}.archive.gz`,
      createdAt: at.toISOString(),
      sizeBytes: 11_000 + daysAgo * 137,
      local: true,
      offsite: true,
      lockedUntil: new Date(at.getTime() + 14 * DAY).toISOString(),
    }
  })
  const jobs: BackupJob[] = snapshots.map((s, i) => ({
    id: `job-mock-${i}`,
    kind: 'backup',
    trigger: 'schedule',
    startedAt: s.createdAt,
    finishedAt: new Date(Date.parse(s.createdAt) + 70_000).toISOString(),
    result: 'ok',
    summary: `สำรองแล้ว ${s.name}, ตรวจผ่าน`,
    snapshot: s.name,
  }))
  return {
    jobs,
    logs: Object.fromEntries(
      jobs.map((j) => [
        j.id,
        `backup (schedule) started ${j.startedAt}\n[backup] saved src/testpulse-backups/db/${j.snapshot}\n[verify] passed (0 warning(s))\n`,
      ]),
    ),
    snapshots,
    settings: {
      schedule: {
        backup: { enabled: true, cron: '0 2 * * *', staleAfterHours: 26 },
        drill: { enabled: true, cron: '0 3 * * 0', staleAfterHours: 170 },
        timezone: 'Asia/Bangkok',
      },
      alerts: {
        emailEnabled: true,
        teamIds: [],
        extraEmails: [],
        teamsEnabled: false,
        teamsWebhookSet: false,
        kumaBackupUrlSet: false,
        kumaDrillUrlSet: false,
      },
    },
    teamsWebhookUrl: null,
  }
}

const db = () => load<BackupDb>(STORAGE_KEYS.backup, seed())
const store = (value: BackupDb) => save(STORAGE_KEYS.backup, value)

const KIND_DONE: Record<BackupJobKind, string> = { backup: 'สำรองแล้ว', verify: 'ตรวจแล้ว', drill: 'ซ้อมกู้' }

/** the running job finishes: a backup adds a snapshot */
function finish(id: string, snapshot?: string): void {
  const data = db()
  const job = data.jobs.find((j) => j.id === id)
  if (!job || job.result !== 'running') return
  const now = new Date()
  let made = snapshot
  if (job.kind === 'backup') {
    made = `testpulse-${stamp(now)}.archive.gz`
    data.snapshots = [
      {
        name: made,
        createdAt: now.toISOString(),
        sizeBytes: 11_800,
        local: true,
        offsite: true,
        lockedUntil: new Date(now.getTime() + 14 * DAY).toISOString(),
      },
      ...data.snapshots,
    ]
  }
  made ??= data.snapshots[0]?.name
  Object.assign(job, {
    result: 'ok',
    finishedAt: now.toISOString(),
    summary:
      job.kind === 'drill'
        ? `ซ้อมกู้ ${made} ลง testpulse-restore, ตรวจผ่าน`
        : `${KIND_DONE[job.kind]}${job.kind === 'backup' ? ` ${made}` : ''}, ตรวจผ่าน`,
    ...(made && job.kind !== 'verify' ? { snapshot: made } : {}),
  })
  data.logs[id] = `${data.logs[id] ?? ''}[mock] ${job.summary}\n`
  store(data)
}

const last = (jobs: BackupJob[], kind: BackupJobKind) => jobs.find((j) => j.kind === kind && j.result !== 'running')

/** GET /backup/status */
export const fetchStatus = () =>
  respond((): BackupStatus => {
    assertCan('admin')
    const { jobs } = db()
    const next = (hour: number, weekday?: number) => {
      const d = new Date()
      d.setHours(hour, 0, 0, 0)
      while (d.getTime() <= Date.now() || (weekday !== undefined && d.getDay() !== weekday)) d.setTime(d.getTime() + DAY)
      return d.toISOString()
    }
    const running = jobs.find((j) => j.result === 'running')
    const lastBackup = last(jobs, 'backup')
    const lastVerify = last(jobs, 'verify')
    const lastDrill = last(jobs, 'drill')
    return {
      reachable: true,
      ...(running ? { running } : {}),
      ...(lastBackup ? { lastBackup } : {}),
      ...(lastVerify ? { lastVerify } : {}),
      ...(lastDrill ? { lastDrill } : {}),
      nextRuns: { backup: next(2), drill: next(3, 0) },
      disk: { usedPercent: 34, freeBytes: 62 * 1024 ** 3 },
      destinations: [
        { id: 'local', label: 'MinIO บนเครื่องนี้', ok: true },
        { id: 'offsite', label: 'MinIO off-site (mirror)', ok: true },
      ],
      problems: [],
    }
  })

/** GET /backup/jobs */
export const fetchJobs = () =>
  respond(() => {
    assertCan('admin')
    return db().jobs
  })

/** GET /backup/jobs/:id/log */
export const fetchJobLog = (id: string) =>
  respond(() => {
    assertCan('admin')
    const data = db()
    if (!data.jobs.some((j) => j.id === id)) throw new ApiError('ไม่พบงานนี้', 404)
    return data.logs[id] ?? ''
  })

/** POST /backup/jobs (409 while another runs) */
export const startJob = (kind: BackupJobKind, snapshot?: string) =>
  respond((): BackupJob => {
    assertCan('admin')
    const data = db()
    if (data.jobs.some((j) => j.result === 'running')) throw new ApiError('มีงานอื่นกำลังทำอยู่ รอให้เสร็จก่อน', 409)
    if (snapshot && (kind !== 'drill' || !data.snapshots.some((s) => s.name === snapshot))) throw new ApiError('ไม่พบ snapshot นี้', 422)
    const now = new Date()
    const job: BackupJob = {
      id: `job-${stamp(now)}-${Math.random().toString(16).slice(2, 8)}`,
      kind,
      trigger: 'manual',
      ...(sessionUser() ? { startedBy: sessionUser()!.name } : {}),
      startedAt: now.toISOString(),
      result: 'running',
      summary: '',
      ...(snapshot ? { snapshot } : {}),
    }
    data.jobs = [job, ...data.jobs]
    data.logs[job.id] = `${kind} (manual, ${job.startedBy ?? '-'}) started ${job.startedAt}\n`
    store(data)
    setTimeout(() => finish(job.id, snapshot), MOCK_JOB_MS)
    return job
  })

/** GET /backup/snapshots */
export const fetchSnapshots = () =>
  respond(() => {
    assertCan('admin')
    return db().snapshots
  })

/** GET /backup/settings */
export const fetchSettings = () =>
  respond(() => {
    assertCan('admin')
    return db().settings
  })

/** PUT /backup/settings (a secret changes only when given; null removes it) */
export const saveSettings = (input: BackupSettingsInput) =>
  respond((): BackupSettings => {
    assertCan('admin')
    const data = db()
    const cronOk = (c: string) => c.trim().split(/\s+/).length === 5
    if (!cronOk(input.schedule.backup.cron) || !cronOk(input.schedule.drill.cron))
      throw new ApiError('ตารางเวลาไม่ถูกต้อง (cron: นาที ชั่วโมง วัน เดือน วันในสัปดาห์)', 422)
    if (input.alerts.teamsWebhookUrl !== undefined) data.teamsWebhookUrl = input.alerts.teamsWebhookUrl
    const { kumaBackupUrl, kumaDrillUrl, teamsWebhookUrl: _hook, ...alerts } = input.alerts
    const was = data.settings.alerts
    data.settings = {
      schedule: { ...input.schedule, timezone: data.settings.schedule.timezone },
      alerts: {
        ...alerts,
        extraEmails: alerts.extraEmails.map((e) => e.toLowerCase()),
        teamsWebhookSet: !!data.teamsWebhookUrl,
        ...(data.teamsWebhookUrl ? { teamsWebhookHint: `…${data.teamsWebhookUrl.slice(-6)}` } : {}),
        kumaBackupUrlSet: kumaBackupUrl === undefined ? was.kumaBackupUrlSet : !!kumaBackupUrl,
        kumaDrillUrlSet: kumaDrillUrl === undefined ? was.kumaDrillUrlSet : !!kumaDrillUrl,
      },
    }
    store(data)
    return data.settings
  })

/** POST /backup/alerts/test */
export const testAlerts = () =>
  respond((): BackupAlertTestResult => {
    assertCan('admin')
    const { alerts } = db().settings
    return { emails: alerts.emailEnabled ? alerts.extraEmails.length : 0, teams: alerts.teamsEnabled && alerts.teamsWebhookSet, errors: [] }
  })
