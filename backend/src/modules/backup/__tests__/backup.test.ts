import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AuditTrailEntry, BackupJob, NotificationItem } from '#contract/types.js'

// The API between the Admin and a fake backup agent (an HTTP server in this file). The agent's address
// and token are set before anything reads the config.
const TOKEN = 'a'.repeat(40)
const received: { method: string; url: string; auth?: string; body: unknown }[] = []
let reply: (method: string, url: string) => { status: number; body: unknown } = () => ({ status: 200, body: { status: true, data: null } })

const readBody = async (req: IncomingMessage) => {
  let text = ''
  for await (const chunk of req) text += chunk
  return text ? JSON.parse(text) : undefined
}
const agent = createServer((req, res) => {
  void readBody(req).then((body) => {
    received.push({ method: req.method!, url: req.url!, ...(req.headers.authorization ? { auth: req.headers.authorization } : {}), body })
    const { status, body: answer } = reply(req.method!, req.url!)
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(answer))
  })
})
await new Promise<void>((resolve) => agent.listen(0, '127.0.0.1', resolve))
process.env.BACKUP_AGENT_URL = `http://127.0.0.1:${(agent.address() as AddressInfo).port}`
process.env.BACKUP_AGENT_TOKEN = TOKEN

const { useTestDatabase } = await import('../../../../tests/helpers/database.js')
const { api, buildApp, client, seedDemo } = await import('../../../../tests/helpers/app.js')
const { MemoryMailer, setMailer } = await import('#core/mail/mailer.js')

useTestDatabase()
const mailer = new MemoryMailer()
let app: Awaited<ReturnType<typeof buildApp>>
beforeAll(async () => {
  setMailer(mailer)
  app = await buildApp()
})
afterAll(async () => {
  setMailer(null)
  await new Promise((resolve) => agent.close(resolve))
})
beforeEach(async () => {
  await seedDemo()
  received.length = 0
  mailer.sent.length = 0
  reply = () => ({ status: 200, body: { status: true, data: null } })
})

const admin = () => client(app).as('user-admin')
const job: BackupJob = {
  id: 'job-20261006T020000-abc123',
  kind: 'drill',
  trigger: 'manual',
  startedBy: 'ผู้ดูแลระบบ',
  startedAt: '2026-10-06T02:00:00.000Z',
  result: 'running',
  summary: '',
}

describe('backup (Admin ↔ agent)', () => {
  it('passes the Admin to the agent with its token, and records who started a job', async () => {
    reply = () => ({ status: 202, body: { status: true, data: job } })
    const res = await admin().post('/backup/jobs').send({ kind: 'drill', snapshot: 'testpulse-20261006-020000.archive.gz' })
    expect(res.status).toBe(202)
    expect(res.body.data).toEqual(job)
    expect(received).toEqual([
      {
        method: 'POST',
        url: '/jobs',
        auth: `Bearer ${TOKEN}`,
        body: { kind: 'drill', startedBy: 'ศุภชัย วัฒนา (Admin)', snapshot: 'testpulse-20261006-020000.archive.gz' },
      },
    ])
    const audit = (await admin().get('/audit-logs')).body.data as AuditTrailEntry[]
    expect(audit[0]).toMatchObject({
      action: 'CREATE',
      targetType: 'BACKUP',
      targetId: job.id,
      details: 'สั่งซ้อมกู้ (testpulse-20261006-020000.archive.gz)',
    })
  })

  it('checks what the Admin asks before the agent sees it', async () => {
    expect((await admin().post('/backup/jobs').send({ kind: 'restore-live' })).status).toBe(400)
    expect((await admin().post('/backup/jobs').send({ kind: 'backup', snapshot: 'testpulse-20261006-020000.archive.gz' })).status).toBe(400)
    expect((await admin().get('/backup/jobs/..%2Fsettings/log')).status).toBe(400)
    expect(received).toEqual([])
  })

  it("hands on the agent's own refusals, and 503 when it does not answer", async () => {
    reply = () => ({ status: 409, body: { status: false, message: 'มีงานอื่นกำลังทำอยู่ รอให้เสร็จก่อน' } })
    const busy = await admin().post('/backup/jobs').send({ kind: 'backup' })
    expect(busy.status).toBe(409)
    expect(busy.body).toMatchObject({ message: 'มีงานอื่นกำลังทำอยู่ รอให้เสร็จก่อน', code: 'busy' })

    reply = () => ({ status: 500, body: { status: false, message: 'boom' } })
    expect((await admin().get('/backup/snapshots')).body).toMatchObject({ code: 'agent_unavailable' })
    // the status page still answers: the agent is just not reachable
    expect((await admin().get('/backup/status')).body.data).toEqual({ reachable: false, nextRuns: {}, destinations: [], problems: [] })
  })

  it('records settings changes, and the secrets never come back', async () => {
    const settings = {
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
    }
    reply = (method) => ({
      status: 200,
      body: {
        status: true,
        data: method === 'PUT' ? { ...settings, alerts: { ...settings.alerts, teamsEnabled: true, teamsWebhookSet: true } } : settings,
      },
    })
    const input = {
      schedule: { backup: settings.schedule.backup, drill: settings.schedule.drill },
      alerts: { emailEnabled: true, teamIds: ['team-ops'], extraEmails: [], teamsEnabled: true, teamsWebhookUrl: 'https://x.example.com/hook?sig=1' },
    }
    const res = await admin().put('/backup/settings').send(input)
    expect(res.status).toBe(200)
    expect(received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /settings', 'PUT /settings'])
    expect(received[1]!.body).toEqual(input)
    const audit = (await admin().get('/audit-logs')).body.data as AuditTrailEntry[]
    expect(audit[0]).toMatchObject({ action: 'UPDATE', targetType: 'BACKUP', details: 'แก้ไขตั้งค่าการสำรองข้อมูล (การแจ้งเตือน)' })
    expect(
      (
        await admin()
          .put('/backup/settings')
          .send({ ...input, schedule: { backup: input.schedule.backup } })
      ).status,
    ).toBe(400)
  })
})

describe('POST /backup/agent-events (the agent alerts)', () => {
  const event = {
    state: 'problem',
    key: 'backup',
    title: 'สำรองข้อมูลไม่สำเร็จ',
    message: 'สำรองไม่สำเร็จ: mongodump failed',
    severity: 'error',
    recipients: { emailEnabled: true, teamIds: ['team-payment'], extraEmails: ['Boss@Example.com', 'somchai.qa@testpulse.dev'] },
  }
  const post = (body: object, token = TOKEN) => request(app).post(api('/backup/agent-events')).set('Authorization', `Bearer ${token}`).send(body)

  it('notifies the Admins and emails the team members (each address once)', async () => {
    const res = await post(event)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ emails: 4 })
    expect(mailer.sent.map((m) => m.to).sort()).toEqual([
      'boss@example.com',
      'kittisak.dev@testpulse.dev',
      'somchai.qa@testpulse.dev',
      'thanakorn.dev@testpulse.dev',
    ])
    expect(mailer.sent[0]).toMatchObject({ subject: '[TestPulse] สำรองข้อมูลไม่สำเร็จ', text: expect.stringContaining('mongodump failed') })

    const forAdmin = (await client(app).as('user-admin').get('/notifications')).body.data as NotificationItem[]
    expect(forAdmin[0]).toMatchObject({ type: 'SYSTEM', title: 'สำรองข้อมูลไม่สำเร็จ', severity: 'error' })
    const forQa = (await client(app).as('user-qa-1').get('/notifications')).body.data as NotificationItem[]
    expect(forQa.map((n) => n.title)).not.toContain('สำรองข้อมูลไม่สำเร็จ')
  })

  it('sends no email when email is off', async () => {
    expect((await post({ ...event, recipients: { ...event.recipients, emailEnabled: false } })).body.data).toEqual({ emails: 0 })
    expect(mailer.sent).toEqual([])
  })

  it('takes only the agent token', async () => {
    expect((await post(event, 'b'.repeat(40))).status).toBe(401)
    const asUser = await client(app).as('user-admin').post('/backup/agent-events').send(event)
    expect(asUser.status).toBe(401)
    expect(mailer.sent).toEqual([])
  })
})
