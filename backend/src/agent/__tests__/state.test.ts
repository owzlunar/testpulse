import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig, parseEnvFile, uriDb } from '../config.js'
import { JobStore, KEEP_DAYS } from '../jobs.js'
import { SettingsStore } from '../settings.js'

const dir = () => mkdtempSync(join(tmpdir(), 'agent-'))

describe('config', () => {
  it('reads backup.env like the scripts do', () => {
    expect(parseEnvFile('# a comment\nA=1\nB="two words"\nC=\'x&y\'\n\nURI=mongodb://u:p@h/db?a=1&b=2\r\n')).toEqual({
      A: '1',
      B: 'two words',
      C: 'x&y',
      URI: 'mongodb://u:p@h/db?a=1&b=2',
    })
    expect(() => parseEnvFile('not a line')).toThrow(/KEY=value/)
    expect(uriDb('mongodb://u:p@mongodb-prod:27017/testpulse?authSource=admin')).toBe('testpulse')
  })

  it('takes everything from BACKUP_ENV, the environment winning, and refuses weak secrets', () => {
    const file = join(dir(), 'backup.env')
    writeFileSync(
      file,
      [
        `BACKUP_AGENT_TOKEN=${'k'.repeat(32)}`,
        `BACKUP_AGENT_SECRET=${'ab'.repeat(32)}`,
        'MONGODB_URI=mongodb://u:p@mongodb-prod:27017/testpulse?authSource=admin',
        'BACKUP_S3_URL=http://minio-prod:9001',
        'BACKUP_S3_ACCESS_KEY=a',
        'BACKUP_S3_SECRET_KEY=b',
        'BACKUP_TOOLS=local',
        'STORAGE_DRIVER=minio',
      ].join('\n'),
    )
    const config = loadConfig({ BACKUP_ENV: file, AGENT_PORT: '9999' })
    expect(config).toMatchObject({
      mode: 'embedded',
      host: '127.0.0.1',
      port: 9999,
      tools: 'local',
      apiUrl: null,
      mongo: { liveDb: 'testpulse', drillDb: 'testpulse-restore' },
      storage: { offsite: null, driver: 'minio', backupBucket: 'testpulse-backups' },
    })
    expect(() => loadConfig({ BACKUP_ENV: file, BACKUP_AGENT_TOKEN: 'short' })).toThrow(/at least 32/)
    expect(() => loadConfig({ BACKUP_ENV: file, BACKUP_AGENT_SECRET: 'nothex' })).toThrow(/64 hex/)
    expect(() => loadConfig({ BACKUP_ENV: join(dir(), 'missing.env') })).toThrow(/BACKUP_ENV/)
  })
})

describe('SettingsStore', () => {
  it('starts with the defaults and keeps secrets encrypted, shown only as set', () => {
    const data = dir()
    const store = new SettingsStore(data, Buffer.alloc(32, 1), 'Asia/Bangkok')
    expect(store.view().schedule).toEqual({
      backup: { enabled: true, cron: '0 2 * * *', staleAfterHours: 26 },
      drill: { enabled: true, cron: '0 3 * * 0', staleAfterHours: 170 },
      timezone: 'Asia/Bangkok',
    })
    const webhook = 'https://prod.example.com/workflows/abc/triggers/manual/paths/invoke?sig=SECRET123456'
    const view = store.update({
      schedule: store.raw.schedule,
      alerts: {
        emailEnabled: true,
        teamIds: ['team-1'],
        extraEmails: [],
        teamsEnabled: true,
        teamsWebhookUrl: webhook,
        kumaBackupUrl: 'http://kuma/api/push/x',
      },
    })
    expect(view.alerts).toMatchObject({ teamsWebhookSet: true, teamsWebhookHint: '…123456', kumaBackupUrlSet: true, kumaDrillUrlSet: false })
    expect(JSON.stringify(view)).not.toContain('SECRET')
    expect(readFileSync(join(data, 'settings.json'), 'utf8')).not.toContain('SECRET')

    // read back after a restart; undefined keeps a secret, null removes it
    const again = new SettingsStore(data, Buffer.alloc(32, 1), 'Asia/Bangkok')
    expect(again.secret('teamsWebhookUrl')).toBe(webhook)
    again.update({
      schedule: again.raw.schedule,
      alerts: { emailEnabled: false, teamIds: [], extraEmails: [], teamsEnabled: true, kumaBackupUrl: null },
    })
    expect(again.secret('teamsWebhookUrl')).toBe(webhook)
    expect(again.secret('kumaBackupUrl')).toBeNull()
  })
})

describe('JobStore', () => {
  it('records jobs, fails the ones a restart cut short and forgets old ones', () => {
    const data = dir()
    const store = new JobStore(data)
    const done = store.create('backup', 'schedule')
    store.finish(done.id, 'ok', 'สำรองแล้ว', 'testpulse-20261006-020000.archive.gz')
    const cut = store.create('drill', 'manual', 'Admin')
    writeFileSync(store.logPath(cut.id), 'output\n')

    expect(store.running()?.id).toBe(cut.id)
    expect(store.last('backup')).toMatchObject({ result: 'ok', snapshot: 'testpulse-20261006-020000.archive.gz' })

    const after = new JobStore(data)
    expect(after.get(cut.id)).toMatchObject({ result: 'failed', summary: expect.stringContaining('หยุดกลางคัน') })
    expect(after.running()).toBeUndefined()
    expect(after.readLog(cut.id)).toBe('output\n')

    after.prune(Date.now() + (KEEP_DAYS + 1) * 24 * 3600 * 1000)
    expect(after.list()).toEqual([])
    expect(after.readLog(cut.id)).toBe('')
  })
})

describe('SettingsStore with another BACKUP_AGENT_SECRET', () => {
  it('treats what it can not open as not set, and takes a new value', () => {
    const data = dir()
    const before = new SettingsStore(data, Buffer.alloc(32, 1), 'Asia/Bangkok')
    before.update({
      schedule: before.raw.schedule,
      alerts: {
        emailEnabled: true,
        teamIds: [],
        extraEmails: [],
        teamsEnabled: true,
        teamsWebhookUrl: 'https://x/hook',
        kumaBackupUrl: 'https://k/push/a',
      },
    })
    const after = new SettingsStore(data, Buffer.alloc(32, 2), 'Asia/Bangkok')
    expect(after.secret('teamsWebhookUrl')).toBeNull()
    expect(after.view().alerts).toMatchObject({ teamsWebhookSet: false, kumaBackupUrlSet: false })
    after.update({
      schedule: after.raw.schedule,
      alerts: { emailEnabled: true, teamIds: [], extraEmails: [], teamsEnabled: true, teamsWebhookUrl: 'https://x/new' },
    })
    expect(after.secret('teamsWebhookUrl')).toBe('https://x/new')
  })
})
