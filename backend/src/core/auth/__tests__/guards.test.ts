import { Router } from 'express'
import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PermissionKey } from '#contract/types.js'
import { createApp } from '../../app.js'
import { config } from '../../config/env.js'
import { send } from '../../http/response.js'
import { authenticate, requireAdmin, requirePermission, requireRole } from '../guards.js'
import { setPrincipalResolver, type Principal } from '../principal.js'
import { signAccessToken } from '../tokens.js'
import { hashPassword, verifyPassword } from '../password.js'

const people: Record<string, Principal> = {
  admin: { id: 'admin', name: 'A', email: 'a@x', roleId: 'r-admin', roleName: 'Admin', discipline: 'other', isAdmin: true, permissions: new Set() },
  tester: {
    id: 'tester',
    name: 'T',
    email: 't@x',
    roleId: 'r-qa',
    roleName: 'QA',
    discipline: 'qa',
    isAdmin: false,
    permissions: new Set<PermissionKey>(['case.view']),
  },
  newcomer: { id: 'newcomer', name: 'N', email: 'n@x', roleId: null, roleName: null, discipline: null, isAdmin: false, permissions: new Set() },
}

const router = Router()
router.get('/any', authenticate, (_req, res) => send(res, 'ok'))
router.get('/role', authenticate, requireRole, (_req, res) => send(res, 'ok'))
router.get('/cases', authenticate, requirePermission('case.view'), (_req, res) => send(res, 'ok'))
router.get('/runs', authenticate, requirePermission(['run.create', 'run.close']), (_req, res) => send(res, 'ok'))
router.get('/admin', authenticate, requireAdmin, (_req, res) => send(res, 'ok'))

let app: Awaited<ReturnType<typeof createApp>>
beforeAll(async () => {
  app = await createApp({ modules: [{ name: 'guards', router, setup: () => setPrincipalResolver(async (id) => people[id] ?? null) }] })
})

const status = async (path: string, who?: string) => {
  const req = request(app).get(`${config.basePath}${path}`)
  return (who ? await req.set('Authorization', `Bearer ${signAccessToken(who).token}`) : await req).status
}

describe('guards', () => {
  it.each([
    ['/any', undefined, 401],
    ['/any', 'gone', 401],
    ['/any', 'newcomer', 200],
    ['/role', 'newcomer', 403],
    ['/role', 'tester', 200],
    ['/cases', 'tester', 200],
    ['/runs', 'tester', 403],
    ['/runs', 'admin', 200],
    ['/admin', 'tester', 403],
    ['/admin', 'admin', 200],
  ] as const)('%s as %s -> %i', async (path, who, expected) => {
    expect(await status(path, who)).toBe(expected)
  })
})

describe('passwords', () => {
  it('verifies the right password only, and rejects malformed hashes', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('wrong horse', hash)).toBe(false)
    expect(await verifyPassword('x', 'md5$abc')).toBe(false)
    expect(await verifyPassword('x', null)).toBe(false)
  })
})
