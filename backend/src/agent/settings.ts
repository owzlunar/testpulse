import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { BackupProblem, BackupProblemKey, BackupSchedule, BackupSettings, BackupSettingsInput } from '#contract/types.js'
import type { AlertEvent } from './alerts.js'
import { readJson, writeJson } from './files.js'

// settings.json: the schedule, where alerts go (the secrets in it encrypted with BACKUP_AGENT_SECRET),
// the problems already alerted (so each is announced once, across restarts) and when the agent first
// started (no "no backup for 26 hours" alarm on a fresh install).

interface Sealed {
  iv: string
  tag: string
  data: string
}

type SecretName = 'teamsWebhookUrl' | 'kumaBackupUrl' | 'kumaDrillUrl'

export interface StoredSettings {
  schedule: Omit<BackupSchedule, 'timezone'>
  alerts: Pick<BackupSettings['alerts'], 'emailEnabled' | 'teamIds' | 'extraEmails' | 'teamsEnabled'> & {
    secrets: Partial<Record<SecretName, Sealed>>
  }
  problems: Partial<Record<BackupProblemKey, BackupProblem>>
  /** alerts the API did not take (down, restarting): sent again at the next check */
  pendingApi: AlertEvent[]
  createdAt: string
}

export const DEFAULT_SETTINGS = (): StoredSettings => ({
  schedule: {
    backup: { enabled: true, cron: '0 2 * * *', staleAfterHours: 26 },
    drill: { enabled: true, cron: '0 3 * * 0', staleAfterHours: 7 * 24 + 2 },
  },
  alerts: { emailEnabled: true, teamIds: [], extraEmails: [], teamsEnabled: false, secrets: {} },
  problems: {},
  pendingApi: [],
  createdAt: new Date().toISOString(),
})

export class SettingsStore {
  private readonly path: string
  private current: StoredSettings

  constructor(
    dataDir: string,
    private readonly key: Buffer,
    private readonly timezone: string,
  ) {
    this.path = join(dataDir, 'settings.json')
    const fallback = DEFAULT_SETTINGS()
    const read = readJson<Partial<StoredSettings>>(this.path, fallback)
    this.current = { ...fallback, ...read, alerts: { ...fallback.alerts, ...read.alerts }, schedule: { ...fallback.schedule, ...read.schedule } }
    writeJson(this.path, this.current)
  }

  get raw(): StoredSettings {
    return this.current
  }

  /** a secret in clear text (null when not set) */
  /**
   * A secret in clear text (null when not set). One sealed with another BACKUP_AGENT_SECRET (a new key,
   * an old volume) counts as not set: the Admin enters it again, instead of the settings breaking.
   */
  secret(name: SecretName): string | null {
    const sealed = this.current.alerts.secrets[name]
    if (!sealed) return null
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(sealed.iv, 'base64'))
      decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
      return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8')
    } catch {
      if (!this.unreadable.has(name)) {
        this.unreadable.add(name)
        console.warn(`[agent] ${name} in settings.json was sealed with another BACKUP_AGENT_SECRET: enter it again on the backup page`)
      }
      return null
    }
  }

  private readonly unreadable = new Set<SecretName>()

  private seal(value: string): Sealed {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
  }

  /** what the web app sees: secrets only as set / not set (and the webhook's last characters) */
  view(): BackupSettings {
    const { schedule, alerts } = this.current
    const webhook = this.secret('teamsWebhookUrl')
    return {
      schedule: { ...schedule, timezone: this.timezone },
      alerts: {
        emailEnabled: alerts.emailEnabled,
        teamIds: alerts.teamIds,
        extraEmails: alerts.extraEmails,
        teamsEnabled: alerts.teamsEnabled,
        teamsWebhookSet: !!webhook,
        ...(webhook ? { teamsWebhookHint: `…${webhook.slice(-6)}` } : {}),
        kumaBackupUrlSet: !!this.secret('kumaBackupUrl'),
        kumaDrillUrlSet: !!this.secret('kumaDrillUrl'),
      },
    }
  }

  update(input: BackupSettingsInput): BackupSettings {
    const secrets = { ...this.current.alerts.secrets }
    for (const name of ['teamsWebhookUrl', 'kumaBackupUrl', 'kumaDrillUrl'] as const) {
      const value = input.alerts[name]
      if (value === null) delete secrets[name]
      else if (typeof value === 'string' && value) secrets[name] = this.seal(value)
    }
    this.current = {
      ...this.current,
      schedule: input.schedule,
      alerts: {
        emailEnabled: input.alerts.emailEnabled,
        teamIds: input.alerts.teamIds,
        extraEmails: input.alerts.extraEmails,
        teamsEnabled: input.alerts.teamsEnabled,
        secrets,
      },
    }
    writeJson(this.path, this.current)
    return this.view()
  }

  setPendingApi(pendingApi: AlertEvent[]): void {
    this.current = { ...this.current, pendingApi }
    writeJson(this.path, this.current)
  }

  setProblems(problems: StoredSettings['problems']): void {
    this.current = { ...this.current, problems }
    writeJson(this.path, this.current)
  }
}
