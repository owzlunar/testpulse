import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Express } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setStorage } from '#core/storage/index.js'
import { LocalStorageAdapter } from '#core/storage/local.adapter.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

useTestDatabase()
let app: Express
let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tp-files-'))
  const storage = new LocalStorageAdapter(dir)
  await storage.init()
  setStorage(storage)
  app = await buildApp()
})
afterAll(async () => {
  setStorage(null)
  await rm(dir, { recursive: true, force: true })
})
beforeEach(() => seedDemo())

const upload = (userId: string, category: string, body: Buffer, name = 'logo.png') =>
  client(app).as(userId).post('/files').field('category', category).attach('file', body, name)

describe('files', () => {
  it('stores an image and serves it back so a browser can’t run it', async () => {
    const res = await upload('user-admin', 'project-logo', PNG)
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      contentType: 'image/png',
      size: PNG.length,
      name: 'logo.png',
      url: expect.stringMatching(/\/files\/file-.+\/content$/),
    })

    const content = await request(app).get(res.body.data.url)
    expect(content.status).toBe(200)
    expect(content.headers['content-type']).toBe('image/png')
    expect(content.headers['x-content-type-options']).toBe('nosniff')
    expect(content.headers['content-security-policy']).toContain('sandbox')
    expect(Buffer.compare(content.body as Buffer, PNG)).toBe(0)
  })

  it('judges the type by content, not by name', async () => {
    const res = await upload('user-qa-1', 'avatar', Buffer.from('<svg onload="alert(1)"></svg>'), 'me.png')
    expect(res.status).toBe(422)
  })

  it('anyone signed in uploads an avatar; only the Admin a project logo', async () => {
    expect((await upload('user-qa-2', 'avatar', PNG)).status).toBe(201)
    expect((await upload('user-qa-2', 'project-logo', PNG)).status).toBe(403)
    expect((await upload('user-qa-2', 'contract', PNG)).status).toBe(400)
  })

  it('refuses files over the size limit', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)])
    expect((await upload('user-admin', 'avatar', big)).status).toBe(413)
  })

  it('answers 404 for an unknown file', async () => {
    expect((await client(app).anonymous.get('/files/file-missing/content')).status).toBe(404)
  })
})
