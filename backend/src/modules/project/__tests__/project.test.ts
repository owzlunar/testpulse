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

const idsFor = async (userId: string) => ((await client(app).as(userId).get('/projects')).body.data as { id: string }[]).map((p) => p.id).sort()

const project = (over: Record<string, unknown> = {}) => ({
  key: 'crm',
  name: 'CRM Revamp',
  description: '',
  status: 'active',
  tags: ['CRM'],
  milestones: [{ id: 'm-1', title: 'UAT', date: '2026-12-01', type: 'uat_signoff' }],
  teamIds: [],
  ...over,
})

describe('project access', () => {
  it('Admins see every project; others their teams’ projects and the ones without a team', async () => {
    expect(await idsFor('user-admin')).toEqual(['proj-1', 'proj-2', 'proj-3'])
    expect(await idsFor('user-qa-1')).toEqual(['proj-1', 'proj-3'])
    expect(await idsFor('user-qa-2')).toEqual(['proj-2', 'proj-3'])
    expect(await idsFor('user-dev-2')).toEqual(['proj-1', 'proj-2', 'proj-3'])
  })

  it('a user without a role sees no project', async () => {
    await client(app).as('user-admin').patch('/users/user-qa-2').send({ roleId: null })
    expect(await idsFor('user-qa-2')).toEqual([])
  })

  it('lists come with the counts of their active cases (the test-case module provides them)', async () => {
    const stats = Object.fromEntries(
      ((await client(app).as('user-admin').get('/projects')).body.data as { id: string; caseStats: { total: number } }[]).map((p) => [
        p.id,
        p.caseStats,
      ]),
    )
    expect(stats['proj-1']).toMatchObject({ total: 4, byStatus: { passed: 2 } })
    expect(stats['proj-3']).toMatchObject({ total: 0, passRate: 0 })
  })
})

describe('project changes (Admin)', () => {
  it('creates a project with an upper-case unique key, ignoring caseStats from the client', async () => {
    const res = await client(app)
      .as('user-admin')
      .post('/projects')
      .send(project({ caseStats: { total: 99 } }))
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ key: 'CRM', caseStats: { total: 0 } })
    expect(
      (
        await client(app)
          .as('user-admin')
          .post('/projects')
          .send(project({ key: 'PAY' }))
      ).status,
    ).toBe(409)
  })

  it('updates and deletes; every change is audited with the Admin as actor', async () => {
    const admin = client(app).as('user-admin')
    expect((await admin.put('/projects/proj-3').send(project({ key: 'AUTH', name: 'SSO v2' }))).body.data.name).toBe('SSO v2')
    expect((await admin.delete('/projects/proj-3')).status).toBe(200)
    expect((await admin.delete('/projects/proj-3')).status).toBe(404)

    const log = (await admin.get('/audit-logs')).body.data as { action: string; targetId: string; userId: string; changes?: { field: string }[] }[]
    const mine = log.filter((e) => e.targetId === 'proj-3')
    expect(mine.map((e) => e.action)).toEqual(['DELETE', 'UPDATE'])
    expect(mine[1]!.userId).toBe('user-admin')
    expect(mine[1]!.changes?.map((c) => c.field)).toEqual(expect.arrayContaining(['name']))
  })
})
