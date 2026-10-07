import type {
  BackupAlertTestResult,
  BackupJob,
  BackupJobKind,
  BackupSettings,
  BackupSettingsInput,
  BackupSnapshot,
  BackupStatus,
} from '#contract/types.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import type { Principal } from '#core/auth/principal.js'
import { logger } from '#core/config/logger.js'
import { getMailer } from '#core/mail/mailer.js'
import { notify } from '#core/notify/notify-sink.js'
import { teams } from '#modules/team/index.js'
import { accounts } from '#modules/user/index.js'
import { agentCall, agentConfigured, AgentUnavailableError } from './backup.agent-client.js'

// Backup & recovery (PRD 5.15): the Admin's way to the backup agent, and where the agent's alerts become
// in-app notifications and emails (the agent knows the chosen teams, the API knows their people).

const KIND_LABELS: Record<BackupJobKind, string> = { backup: 'สำรองข้อมูล', verify: 'ตรวจ backup', drill: 'ซ้อมกู้' }

/** an alert the agent sends (src/agent/alerts.ts) */
export interface AgentEvent {
  state: 'problem' | 'recovered' | 'test'
  key: string
  title: string
  message: string
  severity: 'error' | 'warning' | 'success' | 'info'
  recipients: { emailEnabled: boolean; teamIds: string[]; extraEmails: string[] }
}

const EMPTY_STATUS: BackupStatus = { reachable: false, nextRuns: {}, destinations: [], problems: [] }

/** the emails of the chosen teams' active members, plus the extra ones (each once) */
async function recipientEmails(recipients: AgentEvent['recipients']): Promise<string[]> {
  const memberIds = new Set<string>()
  for (const teamId of recipients.teamIds) for (const id of await teams.memberIds(teamId)) memberIds.add(id)
  const people = await accounts.activeAmong([...memberIds])
  return [...new Set([...people.map((p) => p.email.toLowerCase()), ...recipients.extraEmails.map((e) => e.toLowerCase())])]
}

export const backupService = {
  /** the agent's status; reachable: false (not an error) when it is not set up or does not answer */
  async status(): Promise<BackupStatus> {
    if (!agentConfigured()) return EMPTY_STATUS
    try {
      return await agentCall<BackupStatus>('GET', '/status')
    } catch (err) {
      if (err instanceof AgentUnavailableError) return EMPTY_STATUS
      throw err
    }
  },

  jobs: () => agentCall<BackupJob[]>('GET', '/jobs'),

  async jobLog(id: string): Promise<{ log: string }> {
    return agentCall<{ log: string }>('GET', `/jobs/${encodeURIComponent(id)}/log`)
  },

  async start(p: Principal, kind: BackupJobKind, snapshot?: string): Promise<BackupJob> {
    const job = await agentCall<BackupJob>('POST', '/jobs', { kind, startedBy: p.name, ...(snapshot ? { snapshot } : {}) })
    await recordAudit({
      action: 'CREATE',
      targetType: 'BACKUP',
      targetId: job.id,
      targetTitle: KIND_LABELS[kind],
      details: `สั่ง${KIND_LABELS[kind]}${snapshot ? ` (${snapshot})` : ''}`,
    })
    return job
  },

  snapshots: () => agentCall<BackupSnapshot[]>('GET', '/snapshots'),

  settings: () => agentCall<BackupSettings>('GET', '/settings'),

  async saveSettings(input: BackupSettingsInput): Promise<BackupSettings> {
    const before = await agentCall<BackupSettings>('GET', '/settings')
    const after = await agentCall<BackupSettings>('PUT', '/settings', input)
    const changed: string[] = []
    if (JSON.stringify(before.schedule) !== JSON.stringify(after.schedule)) changed.push('ตารางเวลา')
    const plain = (s: BackupSettings) => JSON.stringify({ ...s.alerts, teamsWebhookHint: undefined })
    if (plain(before) !== plain(after) || input.alerts.teamsWebhookUrl !== undefined) changed.push('การแจ้งเตือน')
    await recordAudit({
      action: 'UPDATE',
      targetType: 'BACKUP',
      targetId: 'settings',
      targetTitle: 'ตั้งค่าการสำรองข้อมูล',
      details: `แก้ไขตั้งค่าการสำรองข้อมูล${changed.length ? ` (${changed.join(', ')})` : ''}`,
    })
    return after
  },

  /** the agent posts to Teams and calls agentEvent() for the in-app notification and the emails */
  testAlerts: () => agentCall<BackupAlertTestResult>('POST', '/alerts/test'),

  /** POST /backup/agent-events (from the agent): notify the Admins, email the recipients; how many emails went out */
  async agentEvent(event: AgentEvent): Promise<{ emails: number }> {
    const admins = await accounts.activeAdmins()
    if (admins.length) {
      await notify({
        type: 'SYSTEM',
        title: event.title,
        message: event.message,
        severity: event.severity,
        to: { userIds: admins.map((a) => a.id) },
      })
    }
    if (!event.recipients.emailEnabled) return { emails: 0 }
    const emails = await recipientEmails(event.recipients)
    const mailer = getMailer()
    let sent = 0
    for (const to of emails) {
      try {
        await mailer.send({
          to,
          subject: `[TestPulse] ${event.title}`,
          text: `${event.title}\n\n${event.message}\n\nเวลา: ${new Date().toLocaleString('th-TH')}\nดูรายละเอียดที่หน้า "สำรองข้อมูล" ของ TestPulse`,
        })
        sent++
      } catch (err) {
        logger.error(`[backup] alert email not sent: ${(err as Error).message}`)
      }
    }
    return { emails: sent }
  },
}
