import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentConfig } from '../config.js'

/** a config for tests: a fresh data folder, no API, made-up logins */
export function testConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    mode: 'embedded',
    host: '127.0.0.1',
    port: 0,
    token: 't'.repeat(40),
    secretKey: Buffer.alloc(32, 7),
    apiUrl: null,
    appUrl: 'https://qa.example.com/testpulse',
    timezone: 'Asia/Bangkok',
    diskLimitPercent: 80,
    dataDir: mkdtempSync(join(tmpdir(), 'agent-')),
    scriptsDir: '/nowhere',
    envFile: '/nowhere/backup.env',
    tools: 'local',
    mongo: { liveUri: 'mongodb://x/testpulse', restoreUri: 'mongodb://x/testpulse', liveDb: 'testpulse', drillDb: 'testpulse-restore' },
    storage: {
      local: { url: 'http://minio-prod:9001', accessKey: 'a', secretKey: 'b' },
      offsite: { url: 'https://backup.example.com', accessKey: 'c', secretKey: 'd' },
      backupBucket: 'testpulse-backups',
      uploadsBucket: 'testpulse',
      driver: 'minio',
    },
    ...overrides,
  }
}

/** a fetch that records its calls and answers 200 (or what `answer` says) */
export function fakeFetch(answer: (url: string) => { status: number; body?: unknown } = () => ({ status: 200 })) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, ...(init ? { init } : {}) })
    const { status, body } = answer(url)
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  }) as typeof fetch
  return { fn, calls }
}
