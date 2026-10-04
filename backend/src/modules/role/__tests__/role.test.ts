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
const role = (over: Record<string, unknown> = {}) => ({
  name: 'Release Manager',
  description: 'ดูแลการปล่อยระบบ',
  discipline: 'other',
  tone: 'caution',
  icon: 'tabler:briefcase',
  permissions: ['run.view', 'report.view'],
  ...over,
})

describe('roles', () => {
  it('everyone signed in can list them, the Admin role first', async () => {
    const res = await client(app).as('user-dev-1').get('/roles')
    expect(res.status).toBe(200)
    expect(res.body.data[0]).toMatchObject({ id: 'role-admin', builtIn: 'admin' })
    expect(res.body.data).toHaveLength(5)
  })

  it('creates a role, dropping unknown permissions and any builtIn the client sends', async () => {
    const res = await admin()
      .post('/roles')
      .send(role({ permissions: ['run.view', 'everything.delete'], builtIn: 'admin' }))
    expect(res.status).toBe(201)
    expect(res.body.data.permissions).toEqual(['run.view'])
    expect(res.body.data.builtIn).toBeUndefined()
  })

  it('keeps names unique regardless of case', async () => {
    const res = await admin()
      .post('/roles')
      .send(role({ name: 'qa lead' }))
    expect(res.status).toBe(409)
  })

  it('the Admin role keeps every permission and its discipline', async () => {
    const res = await admin()
      .put('/roles/role-admin')
      .send(role({ name: 'Super Admin', permissions: [], discipline: 'qa' }))
    expect(res.body.data.name).toBe('Super Admin')
    expect(res.body.data.permissions.length).toBe(24)
    expect(res.body.data.discipline).toBe('other')
  })

  it('deleting moves the users to another role and returns them', async () => {
    const res = await admin().delete('/roles/role-dev?moveTo=role-qa-tester')
    expect(res.status).toBe(200)
    expect(res.body.data.map((u: { id: string }) => u.id).sort()).toEqual(['user-dev-1', 'user-dev-2'])
    const users = (await admin().get('/users')).body.data as { id: string; roleId: string }[]
    expect(users.find((u) => u.id === 'user-dev-1')?.roleId).toBe('role-qa-tester')
  })

  it('deleting without moveTo leaves the users without a role', async () => {
    await admin().delete('/roles/role-dev')
    const users = (await admin().get('/users')).body.data as { id: string; roleId: string | null }[]
    expect(users.find((u) => u.id === 'user-dev-2')?.roleId).toBeNull()
  })

  it('refuses to delete the Admin role or move users to a missing role', async () => {
    expect((await admin().delete('/roles/role-admin')).status).toBe(409)
    expect((await admin().delete('/roles/role-dev?moveTo=role-dev')).status).toBe(422)
    expect((await admin().delete('/roles/role-dev?moveTo=role-missing')).status).toBe(422)
  })

  it('a permission change applies on the next request (nothing is baked into the token)', async () => {
    const dev = client(app).as('user-dev-1')
    expect((await dev.get('/audit-logs')).body.data).toEqual([])
    await admin()
      .put('/roles/role-dev')
      .send(role({ name: 'Developer', discipline: 'dev', permissions: ['audit.view'] }))
    expect((await dev.get('/audit-logs')).body.data.length).toBeGreaterThan(0)
  })
})
