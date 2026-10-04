import type { Express } from 'express'
import mongoose from 'mongoose'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { encryption } from '#core/crypto/encryption.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const admin = () => client(app).as('user-admin')

describe('users', () => {
  it('lists users without password hashes; emails are encrypted at rest', async () => {
    const res = await client(app).as('user-qa-2').get('/users')
    expect(res.body.data).toHaveLength(6)
    expect(res.body.data[0]).not.toHaveProperty('passwordHash')
    expect(res.body.data[0]).not.toHaveProperty('email_bidx')
    const raw = await mongoose.connection.db!.collection('users').findOne({ _id: 'user-admin' as never })
    expect(encryption.isEncrypted(raw?.email)).toBe(true)
  })

  it('changes a role, refusing an unknown one', async () => {
    expect((await admin().patch('/users/user-dev-1').send({ roleId: 'role-qa-lead' })).body.data.roleId).toBe('role-qa-lead')
    expect((await admin().patch('/users/user-dev-1').send({ roleId: 'role-nope' })).status).toBe(422)
  })

  it('never leaves the system without an Admin', async () => {
    const res = await admin().patch('/users/user-admin').send({ roleId: 'role-qa-lead' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('last_admin')
    // with a second Admin it is fine
    await admin().patch('/users/user-qa-1').send({ roleId: 'role-admin' })
    expect((await admin().patch('/users/user-admin').send({ roleId: 'role-qa-lead' })).status).toBe(200)
  })

  it('keeps one account per email', async () => {
    const res = await admin().post('/users').send({ name: 'X', email: 'SOMCHAI.qa@testpulse.dev', roleId: null })
    expect(res.status).toBe(409)
    expect((await admin().patch('/users/user-dev-1').send({ email: 'admin@testpulse.dev' })).status).toBe(409)
  })
})
