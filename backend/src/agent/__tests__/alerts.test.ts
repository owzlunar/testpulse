import { describe, expect, it } from 'vitest'
import { Alerter, evaluateProblems, teamsCard } from '../alerts.js'
import { JobStore } from '../jobs.js'
import { SettingsStore } from '../settings.js'
import { fakeFetch, testConfig } from './helpers.js'

const HOUR = 3_600_000

function setup(apiUrl: string | null = null, answer?: Parameters<typeof fakeFetch>[0]) {
  const config = testConfig({ apiUrl })
  const settings = new SettingsStore(config.dataDir, config.secretKey, config.timezone)
  const jobs = new JobStore(config.dataDir)
  const http = fakeFetch(answer)
  const logs: string[] = []
  const alerter = new Alerter(config, settings, http.fn, (l) => logs.push(l))
  return { config, settings, jobs, http, alerter, logs }
}

const webhook = 'https://prod.example.com/workflows/x/invoke?sig=abc'

describe('evaluateProblems', () => {
  it('sees failed jobs, missed backups / drills and a full disk', () => {
    const { settings, jobs } = setup()
    const now = Date.parse(settings.raw.createdAt) + 30 * HOUR

    const failed = jobs.create('backup', 'schedule')
    jobs.finish(failed.id, 'failed', 'สำรองไม่สำเร็จ: mongodump failed')
    expect(evaluateProblems({ jobs, settings: settings.raw, disk: { usedPercent: 85 }, now })).toEqual({
      backup: 'สำรองไม่สำเร็จ: mongodump failed',
      'stale-backup': 'ยังไม่มี backup ที่สำเร็จเลยตั้งแต่ติดตั้ง agent (30 ชม.)',
      disk: 'ใช้ไป 85% (เกิน 80%)',
    })

    const ok = jobs.create('backup', 'manual')
    jobs.finish(ok.id, 'ok', 'สำรองแล้ว')
    expect(evaluateProblems({ jobs, settings: settings.raw, disk: { usedPercent: 40 }, now: Date.now() })).toEqual({})
  })
})

describe('Alerter', () => {
  it('announces a problem once, and once more when it is over', async () => {
    const { settings, http, alerter } = setup('http://127.0.0.1:8081/api/v1', () => ({ status: 200, body: { status: true, data: { emails: 3 } } }))
    settings.update({
      schedule: settings.raw.schedule,
      alerts: { emailEnabled: true, teamIds: ['team-ops'], extraEmails: ['boss@example.com'], teamsEnabled: true, teamsWebhookUrl: webhook },
    })

    await alerter.sync({ backup: 'สำรองไม่สำเร็จ: x' })
    await alerter.sync({ backup: 'สำรองไม่สำเร็จ: x' })
    expect(http.calls.map((c) => c.url)).toEqual([webhook, 'http://127.0.0.1:8081/api/v1/backup/agent-events'])
    const toApi = JSON.parse(String(http.calls[1]!.init!.body))
    expect(toApi).toMatchObject({
      state: 'problem',
      key: 'backup',
      title: 'สำรองข้อมูลไม่สำเร็จ',
      severity: 'error',
      recipients: { emailEnabled: true, teamIds: ['team-ops'], extraEmails: ['boss@example.com'] },
    })
    expect((http.calls[1]!.init!.headers as Record<string, string>).authorization).toBe(`Bearer ${'t'.repeat(40)}`)

    await alerter.sync({})
    expect(http.calls).toHaveLength(4)
    expect(JSON.parse(String(http.calls[3]!.init!.body))).toMatchObject({ state: 'recovered', title: 'กลับมาปกติ: สำรองข้อมูลไม่สำเร็จ' })
    expect(settings.raw.problems).toEqual({})
  })

  it('logs a channel that fails and still reports the others', async () => {
    const { settings, alerter, logs } = setup('http://api', (url) =>
      url === webhook ? { status: 500 } : { status: 200, body: { data: { emails: 2 } } },
    )
    settings.update({
      schedule: settings.raw.schedule,
      alerts: { emailEnabled: true, teamIds: [], extraEmails: [], teamsEnabled: true, teamsWebhookUrl: webhook },
    })
    const result = await alerter.announce({ state: 'test', key: 'test', title: 'ทดสอบ', message: 'm', severity: 'info' })
    expect(result).toEqual({ teams: false, emails: 2, errors: ['Teams: HTTP 500'] })
    expect(logs).toEqual(['[alert] ทดสอบ: Teams: HTTP 500'])
  })

  it('pushes each backup / drill result to its Uptime Kuma monitor', async () => {
    const { settings, http, alerter } = setup()
    settings.update({
      schedule: settings.raw.schedule,
      alerts: {
        emailEnabled: false,
        teamIds: [],
        extraEmails: [],
        teamsEnabled: false,
        kumaBackupUrl: 'https://kuma.example.com/api/push/AbC?status=up&msg=OK&ping=',
      },
    })
    const started = new Date(Date.now() - 5000).toISOString()
    await alerter.pushKuma({
      id: 'j',
      kind: 'backup',
      trigger: 'schedule',
      startedAt: started,
      finishedAt: new Date().toISOString(),
      result: 'failed',
      summary: 'สำรองไม่สำเร็จ',
    })
    await alerter.pushKuma({ id: 'k', kind: 'drill', trigger: 'schedule', startedAt: started, result: 'ok', summary: 'ok' })
    expect(http.calls).toHaveLength(1)
    const url = new URL(http.calls[0]!.url)
    expect(url.pathname).toBe('/api/push/AbC')
    expect(url.searchParams.get('status')).toBe('down')
    expect(url.searchParams.get('msg')).toBe('สำรองไม่สำเร็จ')
  })

  it('posts an Adaptive Card with a link to the backup page', () => {
    const card = teamsCard(
      { state: 'problem', key: 'disk', title: 'พื้นที่ disk ใกล้เต็ม', message: 'ใช้ไป 85%', severity: 'warning' },
      'https://qa.example.com/testpulse',
    )
    const content = card.attachments[0]!.content
    expect(content.type).toBe('AdaptiveCard')
    expect(content.body[0]).toMatchObject({ text: 'TestPulse: พื้นที่ disk ใกล้เต็ม', color: 'Warning' })
    expect(content.actions).toEqual([{ type: 'Action.OpenUrl', title: 'เปิดหน้าสำรองข้อมูล', url: 'https://qa.example.com/testpulse/admin/backup' }])
  })
})

describe('Alerter when the API is down', () => {
  it('keeps the alert for the API and sends it at the next check', async () => {
    let apiUp = false
    const { settings, http, alerter, logs } = setup('http://api', () => (apiUp ? { status: 200, body: { data: { emails: 1 } } } : { status: 503 }))
    await alerter.sync({ disk: 'ใช้ไป 90%' })
    expect(settings.raw.pendingApi).toMatchObject([{ state: 'problem', key: 'disk' }])
    expect(logs[0]).toContain('(kept, sent again later)')

    apiUp = true
    await alerter.sync({ disk: 'ใช้ไป 90%' })
    expect(settings.raw.pendingApi).toEqual([])
    // the kept one went out; the problem itself is not announced twice
    expect(http.calls.map((c) => JSON.parse(String(c.init!.body)).key)).toEqual(['disk', 'disk'])
  })

  it('does not keep a test message', async () => {
    const { settings, alerter } = setup('http://api', () => ({ status: 503 }))
    await alerter.announce({ state: 'test', key: 'test', title: 'ทดสอบ', message: 'm', severity: 'info' })
    expect(settings.raw.pendingApi).toEqual([])
  })
})
