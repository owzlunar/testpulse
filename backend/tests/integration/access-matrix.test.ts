import type { Express, Router } from 'express'
import { beforeAll, describe, expect, it } from 'vitest'
import { appModules } from '../../src/app-modules.js'
import { useTestDatabase } from '../helpers/database.js'
import { buildApp, client, seedDemo } from '../helpers/app.js'

// Every route of every module, checked from outside: a route someone forgot to guard fails here.

/** routes that work without signing in (anything else must answer 401 without a token);
 *  POST /backup/agent-events takes the backup agent's token instead of a user's (401 without it, checked here) */
const PUBLIC = new Set([
  'POST /auth/login',
  'POST /auth/register',
  'POST /auth/refresh',
  'POST /auth/logout',
  'GET /auth/invites/:token',
  'POST /auth/invites/:token/accept',
  'GET /files/:id/content',
])

/** routes only the built-in Admin may call (a QA Lead gets 403) */
const ADMIN_ONLY = new Set([
  'POST /roles',
  'PUT /roles/:id',
  'DELETE /roles/:id',
  'POST /users',
  'PATCH /users/:id',
  'POST /users/:id/invite',
  'POST /teams',
  'PUT /teams/:id',
  'DELETE /teams/:id',
  'POST /projects',
  'PUT /projects/:id',
  'DELETE /projects/:id',
  'GET /backup/status',
  'GET /backup/jobs',
  'GET /backup/jobs/:id/log',
  'POST /backup/jobs',
  'GET /backup/snapshots',
  'GET /backup/settings',
  'PUT /backup/settings',
  'POST /backup/alerts/test',
])

interface Layer {
  route?: { path: string; methods: Record<string, boolean> }
}

const routes = appModules.flatMap((m) =>
  ((m.router as Router | undefined)?.stack ?? [])
    .map((layer) => (layer as Layer).route)
    .filter((r): r is NonNullable<Layer['route']> => !!r)
    .flatMap((r) => Object.keys(r.methods).map((method) => ({ method: method.toUpperCase(), path: r.path }))),
)

const concrete = (path: string) => path.replace(':token', 'x'.repeat(43)).replace(/:\w+/g, 'missing-id')
const call = (c: ReturnType<ReturnType<typeof client>['as']>, method: string, path: string) =>
  (c[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'] as (p: string) => ReturnType<typeof c.get>)(concrete(path))

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})

describe('access matrix', () => {
  it('knows every route', () => {
    expect(routes.length).toBeGreaterThan(20)
    for (const key of [...PUBLIC, ...ADMIN_ONLY]) expect(routes.map((r) => `${r.method} ${r.path}`)).toContain(key)
  })

  it.each(routes.filter((r) => !PUBLIC.has(`${r.method} ${r.path}`)))('$method $path needs a signed-in user', async ({ method, path }) => {
    const res = await call(client(app).anonymous, method, path)
    expect(res.status).toBe(401)
    expect(res.body).toMatchObject({ status: false, code: 'unauthorized' })
  })

  it.each([...ADMIN_ONLY].map((key) => ({ method: key.split(' ')[0]!, path: key.split(' ')[1]! })))(
    '$method $path is for the Admin only',
    async ({ method, path }) => {
      await seedDemo()
      const res = await call(client(app).as('user-qa-1'), method, path)
      expect(res.status).toBe(403)
    },
  )

  it('ignores identity headers a client makes up', async () => {
    await seedDemo()
    const res = await client(app).anonymous.post('/projects').set('X-User-Role', 'admin').set('X-User-Id', 'user-admin').send({})
    expect(res.status).toBe(401)
  })
})
