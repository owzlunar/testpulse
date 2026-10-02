import { Router } from 'express'
import Joi from 'joi'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { createApp } from '../../app.js'
import { config } from '../../config/env.js'
import { ApiError } from '../errors.js'
import { limiter } from '../rate-limit.js'
import { send } from '../response.js'
import { validate } from '../validate.js'

useTestDatabase()

const router = Router()
router.post('/echo', validate({ body: Joi.object({ name: Joi.string().required() }) }), (req, res) => send(res, req.body))
router.get('/boom', () => {
  throw new Error('secret internals')
})
router.get('/conflict', () => {
  throw ApiError.conflict('ข้อมูลเปลี่ยนไปแล้ว', 'stale')
})
router.get('/limited', limiter(60_000, 2, 'ช้าลงหน่อย'), (_req, res) => send(res, 'ok'))
router.post('/operators', (req, res) => send(res, req.body))

const app = await createApp({ modules: [{ name: 'test', router }] })
const url = (p: string) => `${config.basePath}${p}`

describe('response envelope', () => {
  it('wraps data, drops unknown body fields', async () => {
    const res = await request(app).post(url('/echo')).send({ name: 'a', role: 'admin' })
    expect(res.body).toEqual({ status: true, data: { name: 'a' } })
  })

  it('answers validation errors with 400 and the fields', async () => {
    const res = await request(app).post(url('/echo')).send({})
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ status: false, code: 'invalid', errors: [{ field: 'name' }] })
  })

  it('keeps the code of an ApiError (the client reloads on stale)', async () => {
    const res = await request(app).get(url('/conflict'))
    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ status: false, code: 'stale', message: 'ข้อมูลเปลี่ยนไปแล้ว' })
  })

  it('hides the message of an unexpected error and gives a request id instead', async () => {
    const res = await request(app).get(url('/boom'))
    expect(res.status).toBe(500)
    expect(res.body.message).not.toContain('secret')
    expect(res.body.requestId).toBe(res.headers['x-request-id'])
  })

  it('answers malformed JSON and unknown routes in the same envelope', async () => {
    const bad = await request(app).post(url('/echo')).set('Content-Type', 'application/json').send('{"name":')
    expect(bad.status).toBe(400)
    expect(bad.body.status).toBe(false)
    const missing = await request(app).get(url('/nope'))
    expect(missing.status).toBe(404)
    expect(missing.body).toMatchObject({ status: false, code: 'not_found' })
  })
})

describe('request hygiene', () => {
  it('removes $operators and dotted keys from input', async () => {
    const res = await request(app)
      .post(url('/operators'))
      .send({ name: { $ne: null }, 'a.b': 1, ok: 'yes' })
    expect(res.body.data).toEqual({ name: {}, ok: 'yes' })
  })

  it('keeps a sane X-Request-Id and replaces a forged one', async () => {
    expect((await request(app).get(url('/health/live')).set('X-Request-Id', 'abc-12345678')).headers['x-request-id']).toBe('abc-12345678')
    const forged = await request(app).get(url('/health/live')).set('X-Request-Id', '<script> [FAKE] log line')
    expect(forged.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sends no-store and security headers', async () => {
    const res = await request(app).get(url('/conflict'))
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('allows the web app origin and refuses others', async () => {
    const allowed = await request(app).get(url('/conflict')).set('Origin', config.appUrl)
    expect(allowed.headers['access-control-allow-origin']).toBe(config.appUrl)
    const other = await request(app).get(url('/conflict')).set('Origin', 'https://evil.example')
    expect(other.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('rate limits with 429 in the envelope', async () => {
    await request(app).get(url('/limited'))
    await request(app).get(url('/limited'))
    const res = await request(app).get(url('/limited'))
    expect(res.status).toBe(429)
    expect(res.body).toMatchObject({ status: false, code: 'rate_limited' })
  })
})

describe('health', () => {
  it('live answers without the database, ready checks it', async () => {
    expect((await request(app).get('/health/live')).body).toEqual({ status: 'ok' })
    expect((await request(app).get('/health/ready')).body).toEqual({ status: 'ok', database: 'connected' })
  })
})
