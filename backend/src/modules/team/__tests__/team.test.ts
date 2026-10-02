import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(() => seedDemo())

const admin = () => client(app).as('user-admin')

describe('teams', () => {
  it('creates a team with unique names and real members only', async () => {
    const res = await admin()
      .post('/teams')
      .send({ name: 'ทีม Mobile', tone: 'info', memberIds: ['user-qa-2', 'user-ghost', 'user-qa-2'] })
    expect(res.status).toBe(201)
    expect(res.body.data.memberIds).toEqual(['user-qa-2'])
    expect((await admin().post('/teams').send({ name: 'ทีม payment', tone: 'info', memberIds: [] })).status).toBe(409)
  })

  it('deleting a team removes it from its projects and returns them', async () => {
    const res = await admin().delete('/teams/team-payment')
    expect(res.status).toBe(200)
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['proj-1'])
    expect(res.body.data[0].teamIds).toEqual([])
    // proj-1 is now open to every role
    const dev = await client(app).as('user-qa-2').get('/projects')
    expect(dev.body.data.map((p: { id: string }) => p.id)).toContain('proj-1')
  })
})
