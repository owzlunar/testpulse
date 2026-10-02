import type { Express } from 'express'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { recordAudit } from '#core/audit/audit-sink.js'
import { runWithContext } from '#core/http/context.js'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { buildApp, client, seedDemo } from '../../../../tests/helpers/app.js'

useTestDatabase()
let app: Express
beforeAll(async () => {
  app = await buildApp()
})
beforeEach(async () => {
  await seedDemo()
  // history of a test case in each project (written by a job: no request, the actor is the system)
  for (const projectId of ['proj-1', 'proj-2']) {
    await runWithContext({ requestId: 'job' }, () =>
      recordAudit({ action: 'SLA_BREACHED', targetType: 'TEST_CASE', targetId: 'TC-101', projectId, targetTitle: 'Login', details: 'เลยกำหนด' }),
    )
  }
})

type Entry = { targetType: string; projectId?: string; userId: string; userName: string; action: string }
const entriesFor = async (userId: string) => (await client(app).as(userId).get('/audit-logs')).body.data as Entry[]

describe('audit logs', () => {
  it('audit.view sees every entry, newest first', async () => {
    const all = await entriesFor('user-qa-1') // QA Lead has audit.view
    expect(all.length).toBeGreaterThan(2)
    expect(all.some((e) => e.targetType === 'USER')).toBe(true)
  })

  it('without audit.view: only test case history of projects the user may open', async () => {
    const entries = await entriesFor('user-qa-2') // QA Tester, team-ecommerce -> proj-2
    expect(entries.map((e) => [e.targetType, e.projectId])).toEqual([['TEST_CASE', 'proj-2']])
  })

  it('records the system as actor outside a request', async () => {
    const [entry] = await entriesFor('user-qa-2')
    expect(entry).toMatchObject({ userId: 'system', userName: 'ระบบ', action: 'SLA_BREACHED' })
  })

  it('a user without a role sees nothing', async () => {
    await client(app).as('user-admin').patch('/users/user-qa-2').send({ roleId: null })
    expect(await entriesFor('user-qa-2')).toEqual([])
  })
})
