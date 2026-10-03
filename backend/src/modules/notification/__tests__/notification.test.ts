import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { Express } from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { NotificationItem } from '#contract/types.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { api, bearer, buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'
import { notificationRepository } from '../notification.repository.js'

// Demo people: user-admin · user-qa-1 QA Lead (team-payment) · user-qa-2 QA Tester (team-ecommerce)
// user-dev-1 Developer (team-payment) · user-dev-2 Developer (both). proj-1 payment, proj-2 e-commerce, proj-3 no team.

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const base = { type: 'MODIFIED' as const, title: 'แก้ไข', message: '', severity: 'info' as const }
const titlesOf = async (userId: string): Promise<string[]> =>
  ((await client(app).as(userId).get('/notifications')).body.data as NotificationItem[]).map((n) => n.title)

describe('who gets a notification', () => {
  it('goes to the people named, else to the disciplines, else to everyone who can open the project; never back to the sender', async () => {
    await notificationRepository.create({ ...base, title: 'to dev-1', projectId: 'proj-1', fromUserId: 'user-qa-1', to: { userIds: ['user-dev-1'] } })
    await notificationRepository.create({ ...base, title: 'to qa', projectId: 'proj-3', fromUserId: 'user-dev-1', to: { disciplines: ['qa'] } })
    await notificationRepository.create({ ...base, title: 'everyone of proj-2', projectId: 'proj-2', fromUserId: 'user-qa-2' })

    expect(await titlesOf('user-dev-1')).toEqual(['to dev-1'])
    expect((await titlesOf('user-qa-1')).sort()).toEqual(['to qa'])
    expect((await titlesOf('user-qa-2')).sort()).toEqual(['to qa'])
    expect(await titlesOf('user-dev-2')).toEqual(['everyone of proj-2'])
    expect(await titlesOf('user-admin')).toEqual(['everyone of proj-2'])
  })

  it('skips the kinds a person turned off in their settings', async () => {
    await notificationRepository.create({ ...base, type: 'STATUS_CHANGED', title: 'status', projectId: 'proj-1' })
    await notificationRepository.create({ ...base, title: 'edit', projectId: 'proj-1' })
    const settings = (await client(app).as('user-qa-1').get('/me/settings')).body.data
    await client(app)
      .as('user-qa-1')
      .put('/me/settings')
      .send({ ...settings, alertOnStatusChange: false })
    expect(await titlesOf('user-qa-1')).toEqual(['edit'])
    expect((await titlesOf('user-dev-1')).sort()).toEqual(['edit', 'status'])
  })

  it('gives nothing to a user without a role', async () => {
    await notificationRepository.create({ ...base, title: 'for all' })
    await client(app).as('user-admin').patch('/users/user-dev-1').send({ roleId: null })
    expect(await titlesOf('user-dev-1')).toEqual([])
  })

  it('is sent by the server when an Admin creates a project, to the people of its teams', async () => {
    const project = { key: 'CRM', name: 'CRM', status: 'active', teamIds: ['team-payment'] }
    expect((await client(app).as('user-admin').post('/projects').send(project)).status).toBe(201)
    expect(await titlesOf('user-qa-1')).toEqual(['สร้างโปรเจกต์ใหม่'])
    expect(await titlesOf('user-dev-2')).toEqual(['สร้างโปรเจกต์ใหม่'])
    expect(await titlesOf('user-qa-2')).toEqual([])
    expect(await titlesOf('user-admin')).toEqual([])
  })

  it('goes away with its project', async () => {
    await notificationRepository.create({ ...base, title: 'proj-3 news', projectId: 'proj-3' })
    expect(await titlesOf('user-qa-1')).toEqual(['proj-3 news'])
    await client(app).as('user-admin').delete('/projects/proj-3')
    expect(await titlesOf('user-qa-1')).toEqual([])
  })
})

describe('read and removed, per person', () => {
  it('marks one or all read, and removes one or all, for the signed-in user only', async () => {
    const a = await notificationRepository.create({ ...base, title: 'a', projectId: 'proj-1' })
    await notificationRepository.create({ ...base, title: 'b', projectId: 'proj-1' })
    const dev1 = client(app).as('user-dev-1')
    const readOf = async (userId: string) =>
      Object.fromEntries(((await client(app).as(userId).get('/notifications')).body.data as NotificationItem[]).map((n) => [n.title, n.read]))

    expect((await dev1.patch(`/notifications/${a._id}/read`)).status).toBe(200)
    expect(await readOf('user-dev-1')).toEqual({ a: true, b: false })
    expect(await readOf('user-qa-1')).toEqual({ a: false, b: false })
    await dev1.post('/notifications/read-all')
    expect(await readOf('user-dev-1')).toEqual({ a: true, b: true })

    await dev1.delete(`/notifications/${a._id}`)
    expect(await titlesOf('user-dev-1')).toEqual(['b'])
    await dev1.delete('/notifications')
    expect(await titlesOf('user-dev-1')).toEqual([])
    expect((await titlesOf('user-qa-1')).sort()).toEqual(['a', 'b'])
  })

  it('does not show who else read it', async () => {
    const a = await notificationRepository.create({ ...base, projectId: 'proj-1' })
    await client(app).as('user-dev-1').patch(`/notifications/${a._id}/read`)
    const [item] = (await client(app).as('user-qa-1').get('/notifications')).body.data
    expect(item).not.toHaveProperty('readBy')
    expect(item).not.toHaveProperty('hiddenFor')
  })
})

describe('POST /notifications', () => {
  const own = (userId: string) => ({
    type: 'SYSTEM',
    title: 'ส่งออกแล้ว',
    message: 'x.md',
    severity: 'success',
    projectId: 'proj-1',
    to: { userIds: [userId] },
  })

  it('takes a confirmation to oneself', async () => {
    const res = await client(app).as('user-qa-1').post('/notifications').send(own('user-qa-1'))
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ type: 'SYSTEM', title: 'ส่งออกแล้ว', read: false, fromUserId: 'user-qa-1' })
    expect(await titlesOf('user-qa-1')).toEqual(['ส่งออกแล้ว'])
    expect(await titlesOf('user-dev-1')).toEqual([])
  })

  it('refuses anything else: to someone else, another kind, a project out of reach', async () => {
    const qa1 = client(app).as('user-qa-1')
    expect((await qa1.post('/notifications').send(own('user-dev-1'))).status).toBe(403)
    expect((await qa1.post('/notifications').send({ ...own('user-qa-1'), type: 'MODIFIED' })).status).toBe(400)
    expect((await qa1.post('/notifications').send({ ...own('user-qa-1'), projectId: 'proj-2' })).status).toBe(403)
  })
})

describe('GET /notifications/stream', () => {
  let server: Server
  let base: string
  beforeAll(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  /** the events a user's stream receives until `count` of them arrived */
  async function listen(userId: string) {
    const controller = new AbortController()
    const res = await fetch(`${base}${api('/notifications/stream')}`, { headers: { Authorization: bearer(userId) }, signal: controller.signal })
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    return {
      async next(): Promise<{ event: string; data: unknown }> {
        for (;;) {
          const end = buffer.indexOf('\n\n')
          if (end >= 0) {
            const block = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            const event = /^event: (.+)$/m.exec(block)?.[1]
            if (event) return { event, data: JSON.parse(/^data: (.+)$/m.exec(block)![1]!) }
            continue
          }
          const { value, done } = await reader.read()
          if (done) throw new Error('stream ended')
          buffer += value
        }
      },
      close: () => controller.abort(),
    }
  }

  it('pushes a new notification to the people it is for, and a change of read state to the reader', async () => {
    const dev1 = await listen('user-dev-1')
    const project = { key: 'CRM', name: 'CRM', status: 'active', teamIds: ['team-payment'] }
    await client(app).as('user-admin').post('/projects').send(project)
    const pushed = await dev1.next()
    expect(pushed).toMatchObject({ event: 'notification', data: { title: 'สร้างโปรเจกต์ใหม่', read: false } })

    await client(app)
      .as('user-dev-1')
      .patch(`/notifications/${(pushed.data as NotificationItem).id}/read`)
    expect(await dev1.next()).toEqual({ event: 'changed', data: {} })
    dev1.close()
  })

  it('needs a signed-in user', async () => {
    expect((await fetch(`${base}${api('/notifications/stream')}`)).status).toBe(401)
  })
})
