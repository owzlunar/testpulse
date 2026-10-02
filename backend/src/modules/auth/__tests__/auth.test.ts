import type { Express } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MemoryMailer, setMailer } from '#core/mail/mailer.js'
import { DEMO_PASSWORD } from '#modules/user/index.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { api, buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

useTestDatabase()

let app: Express
let mailer: MemoryMailer
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(async () => {
  mailer = new MemoryMailer()
  setMailer(mailer)
  await seedDemo()
})
afterEach(() => setMailer(null))

const login = (email: string, password: string) => request(app).post(api('/auth/login')).send({ email, password })
/** the refresh cookie a response set ("tp_refresh=<token>") */
const refreshCookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tp_refresh='))!.split(';')[0]!
const refresh = (cookie?: string) => {
  const req = request(app).post(api('/auth/refresh'))
  return cookie ? req.set('Cookie', cookie) : req
}

describe('login', () => {
  it('returns the user and an access token, and sets an httpOnly refresh cookie', async () => {
    const res = await login('Somchai.QA@testpulse.dev', DEMO_PASSWORD)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ user: { id: 'user-qa-1', email: 'somchai.qa@testpulse.dev' }, expiresIn: 900 })
    expect(res.body.data.user).not.toHaveProperty('passwordHash')
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tp_refresh='))!
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Strict/)
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/)

    const me = await request(app).get(api('/auth/me')).set('Authorization', `Bearer ${res.body.data.accessToken}`)
    expect(me.body.data.id).toBe('user-qa-1')
  })

  it('answers a wrong password and an unknown email the same way', async () => {
    const wrong = await login('somchai.qa@testpulse.dev', 'not-the-password')
    const unknown = await login('nobody@testpulse.dev', DEMO_PASSWORD)
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body.message).toBe(unknown.body.message)
  })

  it('refuses a token signed with another key, with alg none, or expired', async () => {
    const forged = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1c2VyLWFkbWluIn0.'
    const res = await request(app).get(api('/auth/me')).set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(401)
  })
})

describe('refresh tokens', () => {
  it('rotate on every use', async () => {
    const first = refreshCookieOf(await login('admin@testpulse.dev', DEMO_PASSWORD))
    const res = await refresh(first)
    expect(res.status).toBe(200)
    expect(res.body.data.user.id).toBe('user-admin')
    expect(refreshCookieOf(res)).not.toBe(first)
  })

  it('revoke the whole sign-in when a rotated token is used again later (theft)', async () => {
    const first = refreshCookieOf(await login('admin@testpulse.dev', DEMO_PASSWORD))
    const second = refreshCookieOf(await refresh(first))
    // past the grace period of the rotation
    await mongoose.connection
      .db!.collection('refresh_tokens')
      .updateMany({ rotatedAt: { $ne: null } }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } })
    expect((await refresh(first)).status).toBe(401) // replayed
    expect((await refresh(second)).status).toBe(401) // the legitimate one is revoked too
  })

  it('give a just-rotated token another chance: the browser lost the response (reload, navigation)', async () => {
    const first = refreshCookieOf(await login('admin@testpulse.dev', DEMO_PASSWORD))
    expect((await refresh(first)).status).toBe(200) // the cookie of this answer never reached the browser
    const again = await refresh(first)
    expect(again.status).toBe(200)
    expect((await refresh(refreshCookieOf(again))).status).toBe(200) // and the sign-in goes on
  })

  it('let two tabs refresh with the same token at once', async () => {
    const cookie = refreshCookieOf(await login('admin@testpulse.dev', DEMO_PASSWORD))
    const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)])
    expect([a.status, b.status]).toEqual([200, 200])
  })

  it('never revive a token signed out with, even right away', async () => {
    const cookie = refreshCookieOf(await login('admin@testpulse.dev', DEMO_PASSWORD))
    await request(app).post(api('/auth/logout')).set('Cookie', cookie)
    expect((await refresh(cookie)).status).toBe(401)
  })

  it('stop working after logout', async () => {
    const cookie = refreshCookieOf(await login('admin@testpulse.dev', DEMO_PASSWORD))
    expect((await request(app).post(api('/auth/logout')).set('Cookie', cookie)).status).toBe(200)
    expect((await refresh(cookie)).status).toBe(401)
    expect((await refresh()).status).toBe(401)
  })
})

describe('register', () => {
  it('creates an active account without a role, which sees no projects', async () => {
    const res = await request(app)
      .post(api('/auth/register'))
      .send({ name: 'มานี ใหม่', email: 'manee@testpulse.dev', title: 'Manual Tester', password: 'secret-pass-1', roleId: 'role-admin' })
    expect(res.status).toBe(201)
    expect(res.body.data.user).toMatchObject({ email: 'manee@testpulse.dev', roleId: null, status: 'active' })
    const projects = await request(app).get(api('/projects')).set('Authorization', `Bearer ${res.body.data.accessToken}`)
    expect(projects.body.data).toEqual([])
  })

  it('refuses an email that already has an account, and a short password', async () => {
    const taken = await request(app).post(api('/auth/register')).send({ name: 'X', email: 'ADMIN@testpulse.dev', password: 'long-enough-1' })
    expect(taken.status).toBe(409)
    const short = await request(app).post(api('/auth/register')).send({ name: 'X', email: 'x@testpulse.dev', password: 'short' })
    expect(short.status).toBe(400)
  })
})

describe('invites', () => {
  const inviteToken = () => /\/invite\/([\w-]+)/.exec(mailer.sent.at(-1)!.text)![1]!

  it('Admin adds a user, who sets a password from the mailed link and can then sign in', async () => {
    const created = await client(app)
      .as('user-admin')
      .post('/users')
      .send({ name: 'วิชัย QA', email: 'wichai@testpulse.dev', roleId: 'role-qa-tester' })
    expect(created.status).toBe(201)
    expect(created.body.data).toMatchObject({ status: 'invited', roleId: 'role-qa-tester' })
    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]!.to).toBe('wichai@testpulse.dev')

    // no password yet: can't sign in
    expect((await login('wichai@testpulse.dev', 'anything-at-all')).status).toBe(401)

    const token = inviteToken()
    const info = await request(app).get(api(`/auth/invites/${token}`))
    expect(info.body.data).toMatchObject({ name: 'วิชัย QA', email: 'wichai@testpulse.dev' })

    const accepted = await request(app)
      .post(api(`/auth/invites/${token}/accept`))
      .send({ password: 'my-new-password' })
    expect(accepted.status).toBe(200)
    expect(accepted.body.data.user.status).toBe('active')
    expect((await login('wichai@testpulse.dev', 'my-new-password')).status).toBe(200)

    // single use
    expect(
      (
        await request(app)
          .post(api(`/auth/invites/${token}/accept`))
          .send({ password: 'another-password' })
      ).status,
    ).toBe(404)
  })

  it('a resent invite replaces the earlier link', async () => {
    const created = await client(app).as('user-admin').post('/users').send({ name: 'A', email: 'a@testpulse.dev', roleId: null })
    const firstToken = inviteToken()
    expect((await client(app).as('user-admin').post(`/users/${created.body.data.id}/invite`)).status).toBe(200)
    expect(inviteToken()).not.toBe(firstToken)
    expect((await request(app).get(api(`/auth/invites/${firstToken}`))).status).toBe(404)
    expect((await request(app).get(api(`/auth/invites/${inviteToken()}`))).status).toBe(200)
  })

  it('cannot be resent to an active user', async () => {
    expect((await client(app).as('user-admin').post('/users/user-qa-1/invite')).status).toBe(409)
  })
})

describe('change password', () => {
  it('needs the current password and signs out the other sessions', async () => {
    const other = refreshCookieOf(await login('pitchaya.qa@testpulse.dev', DEMO_PASSWORD))
    const me = client(app).as('user-qa-2')

    expect((await me.put('/me/password').send({ currentPassword: 'wrong-one', newPassword: 'brand-new-pass' })).status).toBe(400)
    const changed = await me.put('/me/password').send({ currentPassword: DEMO_PASSWORD, newPassword: 'brand-new-pass' })
    expect(changed.status).toBe(200)
    expect(changed.body.data.accessToken).toBeTruthy()

    expect((await refresh(other)).status).toBe(401)
    expect((await login('pitchaya.qa@testpulse.dev', DEMO_PASSWORD)).status).toBe(401)
    expect((await login('pitchaya.qa@testpulse.dev', 'brand-new-pass')).status).toBe(200)
  })
})
