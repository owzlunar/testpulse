import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Agent } from '../agent.js'
import { Alerter } from '../alerts.js'
import { createAgentServer } from '../http.js'
import { JobStore } from '../jobs.js'
import { Runner, type ScriptRunner } from '../runner.js'
import { SettingsStore } from '../settings.js'
import { Storage } from '../storage.js'
import { fakeFetch, testConfig } from './helpers.js'

let server: Server
let base: string
let agent: Agent
let release: () => void = () => {}
const token = 't'.repeat(40)

beforeEach(async () => {
  const config = testConfig()
  const settings = new SettingsStore(config.dataDir, config.secretKey, config.timezone)
  const jobs = new JobStore(config.dataDir)
  // scripts that wait until the test lets them finish
  const run: ScriptRunner = (_script, _args, log) =>
    new Promise((resolve) => {
      release = () => {
        const output = '[verify] passed (0 warning(s))\n'
        log.write(output)
        resolve({ code: 0, output })
      }
    })
  const storage = new Storage(config, {
    local: {
      ping: async () => {},
      dumps: async () => [{ name: 'testpulse-20261006-020000.archive.gz', size: 100, lastModified: new Date('2026-10-05T19:00:03Z') }],
    },
    offsite: {
      ping: async () => {
        throw new Error('connect ECONNREFUSED')
      },
      dumps: async () => [
        {
          name: 'testpulse-20261006-020000.archive.gz',
          size: 100,
          lastModified: new Date('2026-10-05T19:00:05Z'),
          lockedUntil: '2026-10-19T19:00:05.000Z',
        },
        { name: 'testpulse-20261005-020000.archive.gz', size: 90, lastModified: new Date('2026-10-04T19:00:05Z') },
      ],
    },
  })
  const alerter = new Alerter(config, settings, fakeFetch().fn, () => {})
  const runner = new Runner(
    config,
    jobs,
    run,
    async () => {},
    () => {},
  )
  agent = new Agent(config, settings, jobs, runner, storage, alerter, () => {})
  agent.schedule()
  server = createAgentServer(agent)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  release()
  await agent.runner.idle()
  agent.stop()
  await new Promise((resolve) => server.close(resolve))
})

const call = async (method: string, path: string, body?: unknown, auth = token) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, body: (await res.json()) as { status: boolean; data?: never; message?: string } }
}

describe('agent HTTP API', () => {
  it('answers /health to anyone and nothing else without the token', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200)
    expect(await call('GET', '/status', undefined, 'wrong')).toMatchObject({ status: 401 })
    expect(await call('GET', '/nope')).toMatchObject({ status: 404 })
  })

  it('starts a job, refuses a second one, and serves its log', async () => {
    const started = await call('POST', '/jobs', { kind: 'verify', startedBy: 'Admin' })
    expect(started).toMatchObject({ status: 202, body: { data: { kind: 'verify', result: 'running', startedBy: 'Admin' } } })
    const busy = await call('POST', '/jobs', { kind: 'backup' })
    expect(busy).toMatchObject({ status: 409, body: { message: 'มีงานอื่นกำลังทำอยู่ รอให้เสร็จก่อน' } })

    release()
    await agent.runner.idle()
    const id = (started.body.data as unknown as { id: string }).id
    expect(await call('GET', '/jobs')).toMatchObject({ body: { data: [{ id, result: 'ok' }] } })
    expect((await call('GET', `/jobs/${id}/log`)).body.data).toMatchObject({ log: expect.stringContaining('passed (0 warning(s))') })
    expect(await call('GET', '/jobs/job-unknown/log')).toMatchObject({ status: 404 })
  })

  it('checks what it is asked to run', async () => {
    expect(await call('POST', '/jobs', { kind: 'restore-live' })).toMatchObject({ status: 422 })
    expect(await call('POST', '/jobs', { kind: 'backup', snapshot: 'x.gz' })).toMatchObject({ status: 422 })
    expect(await call('POST', '/jobs', { kind: 'drill', snapshot: '../../etc/passwd' })).toMatchObject({ status: 422 })
  })

  it('lists snapshots of both sides and the state of each destination', async () => {
    const snapshots = await call('GET', '/snapshots')
    expect(snapshots.body.data).toEqual([
      {
        name: 'testpulse-20261006-020000.archive.gz',
        createdAt: '2026-10-05T19:00:03.000Z',
        sizeBytes: 100,
        local: true,
        offsite: true,
        lockedUntil: '2026-10-19T19:00:05.000Z',
      },
      { name: 'testpulse-20261005-020000.archive.gz', createdAt: '2026-10-04T19:00:05.000Z', sizeBytes: 90, local: false, offsite: true },
    ])
    const status = await call('GET', '/status')
    expect(status.body.data).toMatchObject({
      reachable: true,
      destinations: [
        { id: 'local', ok: true },
        { id: 'offsite', ok: false, message: 'connect ECONNREFUSED' },
      ],
      nextRuns: { backup: expect.any(String), drill: expect.any(String) },
    })
  })

  it('validates and saves settings, re-scheduling', async () => {
    const current = (await call('GET', '/settings')).body.data as unknown as { schedule: Record<string, unknown> }
    const bad = await call('PUT', '/settings', {
      schedule: { backup: { enabled: true, cron: 'every day', staleAfterHours: 26 }, drill: current.schedule.drill },
      alerts: { emailEnabled: true, teamIds: [], extraEmails: [], teamsEnabled: false },
    })
    expect(bad).toMatchObject({ status: 422, body: { message: expect.stringContaining('ตารางเวลาสำรองไม่ถูกต้อง') } })
    expect(
      await call('PUT', '/settings', {
        schedule: { backup: { enabled: true, cron: '0 2 * * *', staleAfterHours: 26 }, drill: current.schedule.drill },
        alerts: { emailEnabled: true, teamIds: [], extraEmails: ['not-an-email'], teamsEnabled: false },
      }),
    ).toMatchObject({ status: 422 })

    const saved = await call('PUT', '/settings', {
      schedule: { backup: { enabled: false, cron: '30 1 * * *', staleAfterHours: 30 }, drill: current.schedule.drill },
      alerts: {
        emailEnabled: true,
        teamIds: ['team-1'],
        extraEmails: ['Ops@Example.com'],
        teamsEnabled: true,
        teamsWebhookUrl: 'https://x.example.com/hook',
      },
    })
    expect(saved).toMatchObject({
      status: 200,
      body: {
        data: { schedule: { backup: { enabled: false, cron: '30 1 * * *' } }, alerts: { extraEmails: ['ops@example.com'], teamsWebhookSet: true } },
      },
    })
    expect((await call('GET', '/status')).body.data).toMatchObject({ nextRuns: { drill: expect.any(String) } })
    expect(((await call('GET', '/status')).body.data as unknown as { nextRuns: object }).nextRuns).not.toHaveProperty('backup')
  })
})
