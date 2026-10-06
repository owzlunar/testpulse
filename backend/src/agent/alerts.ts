import type { BackupJob, BackupProblem, BackupProblemKey } from '#contract/types.js'
import type { AgentConfig } from './config.js'
import type { JobStore } from './jobs.js'
import type { SettingsStore, StoredSettings } from './settings.js'

// What is wrong right now, and telling people once when a problem starts and once when it is over:
//   Microsoft Teams   the agent posts to the channel's Workflows webhook itself
//   in-app + email    the agent tells the API (POST /backup/agent-events), which notifies the Admins and
//                     emails the chosen teams (it knows the people; the agent does not)
//   Uptime Kuma       after every backup / drill the agent pushes up or down; Kuma raises its own
//                     alarm when the pushes stop (the agent or the machine is down)

export const DISK_LIMIT_PERCENT = 80
/** alerts kept for the API at most (the oldest go first) */
export const PENDING_MAX = 50

const TITLES: Record<BackupProblemKey, string> = {
  backup: 'สำรองข้อมูลไม่สำเร็จ',
  verify: 'ตรวจ backup ไม่ผ่าน',
  drill: 'ซ้อมกู้ไม่ผ่าน',
  'stale-backup': 'ไม่มี backup ใหม่ตามรอบ',
  'stale-drill': 'ไม่ได้ซ้อมกู้ตามรอบ',
  disk: 'พื้นที่ disk ใกล้เต็ม',
}

export type CurrentProblems = Partial<Record<BackupProblemKey, string>>

/** the problems the jobs, the schedule and the disk show now: key → message */
export function evaluateProblems(input: { jobs: JobStore; settings: StoredSettings; disk?: { usedPercent: number }; now?: number }): CurrentProblems {
  const { jobs, settings, disk } = input
  const now = input.now ?? Date.now()
  const out: CurrentProblems = {}
  for (const kind of ['backup', 'verify', 'drill'] as const) {
    const last = jobs.last(kind)
    if (last?.result === 'failed') out[kind] = last.summary
  }
  for (const kind of ['backup', 'drill'] as const) {
    const entry = settings.schedule[kind]
    if (!entry.enabled) continue
    const ok = jobs.last(kind, ['ok', 'warning'])
    const since = Date.parse(ok?.finishedAt ?? settings.createdAt)
    const hours = Math.floor((now - since) / 3_600_000)
    if (hours >= entry.staleAfterHours) {
      out[`stale-${kind}`] = ok
        ? `${kind === 'backup' ? 'backup' : 'การซ้อมกู้'} ที่สำเร็จล่าสุดเมื่อ ${hours} ชม. ก่อน (เกิน ${entry.staleAfterHours} ชม.)`
        : `ยังไม่มี${kind === 'backup' ? ' backup ' : 'การซ้อมกู้'}ที่สำเร็จเลยตั้งแต่ติดตั้ง agent (${hours} ชม.)`
    }
  }
  if (disk && disk.usedPercent > DISK_LIMIT_PERCENT) out.disk = `ใช้ไป ${disk.usedPercent}% (เกิน ${DISK_LIMIT_PERCENT}%)`
  return out
}

export interface AlertEvent {
  state: 'problem' | 'recovered' | 'test'
  key: BackupProblemKey | 'test'
  title: string
  message: string
  severity: 'error' | 'warning' | 'success' | 'info'
}

/** where the API sends the in-app notification and the emails */
export interface Recipients {
  emailEnabled: boolean
  teamIds: string[]
  extraEmails: string[]
}

type Fetch = typeof fetch

export class Alerter {
  constructor(
    private readonly config: AgentConfig,
    private readonly settings: SettingsStore,
    private readonly http: Fetch = fetch,
    private readonly log: (line: string) => void = (line) => console.log(line),
  ) {}

  /** compares with what was already announced; announces what started and what is over */
  async sync(current: CurrentProblems, now = new Date()): Promise<BackupProblem[]> {
    await this.retryApi()
    const before = this.settings.raw.problems
    const after: StoredSettings['problems'] = {}
    const events: AlertEvent[] = []
    for (const [key, message] of Object.entries(current) as [BackupProblemKey, string][]) {
      const known = before[key]
      after[key] = { key, message, since: known?.since ?? now.toISOString() }
      if (!known)
        events.push({ state: 'problem', key, title: TITLES[key], message, severity: key === 'disk' || key.startsWith('stale') ? 'warning' : 'error' })
    }
    for (const key of Object.keys(before) as BackupProblemKey[]) {
      if (!current[key])
        events.push({ state: 'recovered', key, title: `กลับมาปกติ: ${TITLES[key]}`, message: 'ไม่พบปัญหานี้แล้ว', severity: 'success' })
    }
    this.settings.setProblems(after)
    for (const event of events) await this.announce(event)
    return Object.values(after)
  }

  /** every channel that is on; failures are logged, never thrown */
  async announce(event: AlertEvent): Promise<{ teams: boolean; emails: number; errors: string[] }> {
    const errors: string[] = []
    const teams = await this.postTeams(event).catch((err: Error) => {
      errors.push(`Teams: ${err.message}`)
      return false
    })
    const emails = await this.callApi(event).catch((err: Error) => {
      errors.push(`API: ${err.message}`)
      // the API is down or restarting: in-app and email go out at the next check (a test is not kept)
      if (event.state !== 'test') this.settings.setPendingApi([...this.settings.raw.pendingApi, event].slice(-PENDING_MAX))
      return 0
    })
    for (const e of errors)
      this.log(`[alert] ${event.title}: ${e}${event.state !== 'test' && e.startsWith('API') ? ' (kept, sent again later)' : ''}`)
    return { teams, emails, errors }
  }

  /** the alerts the API missed, oldest first; what fails again stays */
  private async retryApi(): Promise<void> {
    const pending = this.settings.raw.pendingApi
    if (!pending.length) return
    const left: AlertEvent[] = []
    for (const event of pending) {
      try {
        await this.callApi(event)
      } catch {
        left.push(event)
      }
    }
    this.settings.setPendingApi(left)
    if (left.length < pending.length) this.log(`[alert] ${pending.length - left.length} kept alert(s) sent to the API`)
  }

  recipients(): Recipients {
    const { emailEnabled, teamIds, extraEmails } = this.settings.raw.alerts
    return { emailEnabled, teamIds, extraEmails }
  }

  private async postTeams(event: AlertEvent): Promise<boolean> {
    const url = this.settings.secret('teamsWebhookUrl')
    if (!this.settings.raw.alerts.teamsEnabled || !url) return false
    const res = await this.http(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(teamsCard(event, this.config.appUrl)),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return true
  }

  /** the API notifies the Admins and emails the recipients; answers how many emails went out */
  private async callApi(event: AlertEvent): Promise<number> {
    if (!this.config.apiUrl) return 0
    const res = await this.http(`${this.config.apiUrl}/backup/agent-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.token}` },
      body: JSON.stringify({ ...event, recipients: this.recipients() }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json().catch(() => null)) as { data?: { emails?: number } } | null
    return body?.data?.emails ?? 0
  }

  /** Uptime Kuma push monitor of the job's kind: up (ok / warning) or down (failed) */
  async pushKuma(job: BackupJob): Promise<void> {
    const name = job.kind === 'drill' ? 'kumaDrillUrl' : job.kind === 'backup' ? 'kumaBackupUrl' : null
    const base = name ? this.settings.secret(name) : null
    if (!base) return
    const url = new URL(base)
    url.searchParams.set('status', job.result === 'failed' ? 'down' : 'up')
    url.searchParams.set('msg', job.summary.slice(0, 200))
    url.searchParams.set('ping', job.finishedAt ? String(Date.parse(job.finishedAt) - Date.parse(job.startedAt)) : '')
    try {
      const res = await this.http(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      this.log(`[alert] Uptime Kuma push (${job.kind}): ${(err as Error).message}`)
    }
  }
}

/** an Adaptive Card message, the shape a Teams Workflows webhook posts to the channel */
export function teamsCard(event: AlertEvent, appUrl: string | null) {
  const color = event.severity === 'error' ? 'Attention' : event.severity === 'warning' ? 'Warning' : 'Good'
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: `TestPulse: ${event.title}`, weight: 'Bolder', size: 'Medium', color, wrap: true },
            { type: 'TextBlock', text: event.message, wrap: true },
            { type: 'TextBlock', text: new Date().toLocaleString('th-TH'), isSubtle: true, size: 'Small', wrap: true },
          ],
          ...(appUrl ? { actions: [{ type: 'Action.OpenUrl', title: 'เปิดหน้าสำรองข้อมูล', url: `${appUrl}/backup` }] } : {}),
        },
      },
    ],
  }
}
