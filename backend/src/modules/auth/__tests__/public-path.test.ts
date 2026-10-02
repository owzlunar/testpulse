import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// The app served under https://mydomain.example/testpulse: cookies, file URLs and invite links
// carry the sub path (this file sets BASE_URL before anything reads the config).
process.env.BASE_URL = 'https://mydomain.example/testpulse'

const { useTestDatabase } = await import('../../../../tests/helpers/database.js')
const { api, buildApp, client, seedDemo } = await import('../../../../tests/helpers/app.js')
const { MemoryMailer, setMailer } = await import('#core/mail/mailer.js')
const { setStorage } = await import('#core/storage/index.js')
const { LocalStorageAdapter } = await import('#core/storage/local.adapter.js')
const { DEMO_PASSWORD } = await import('#modules/user/index.js')

useTestDatabase()
const mailer = new MemoryMailer()
let dir: string
let app: Awaited<ReturnType<typeof buildApp>>
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tp-sub-'))
  setStorage(new LocalStorageAdapter(dir))
  setMailer(mailer)
  app = await buildApp()
})
afterAll(async () => {
  setStorage(null)
  setMailer(null)
  await rm(dir, { recursive: true, force: true })
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

describe('served under a sub path', () => {
  it('scopes the refresh cookie to the public API path', async () => {
    await seedDemo()
    const res = await request(app).post(api('/auth/login')).send({ email: 'admin@testpulse.dev', password: DEMO_PASSWORD })
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tp_refresh='))!
    expect(cookie).toMatch(/Path=\/testpulse\/api\/v1\/auth/)
  })

  it('gives file URLs and invite links with the sub path', async () => {
    await seedDemo()
    const upload = await client(app).as('user-admin').post('/files').field('category', 'avatar').attach('file', PNG, 'a.png')
    expect(upload.body.data.url).toMatch(/^\/testpulse\/api\/v1\/files\/file-.+\/content$/)

    await client(app).as('user-admin').post('/users').send({ name: 'N', email: 'n@testpulse.dev', roleId: null })
    expect(mailer.sent.at(-1)!.text).toMatch(/https:\/\/mydomain\.example\/testpulse\/invite\/[\w-]+/)
  })

  it('allows the public origin for CORS', async () => {
    const res = await request(app).get(api('/roles')).set('Origin', 'https://mydomain.example')
    expect(res.headers['access-control-allow-origin']).toBe('https://mydomain.example')
  })
})
