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

const settings = {
  alertOnModification: false,
  alertOnStatusChange: true,
  alertOnExpiry: true,
  expiryDaysThreshold: 5,
  obsidianFrontmatter: true,
  obsidianCallouts: false,
  obsidianWikilinks: true,
  stickyPageHeader: false,
}

describe('settings', () => {
  it('starts from the defaults and keeps each user’s own', async () => {
    const me = client(app).as('user-qa-2')
    expect((await me.get('/me/settings')).body.data).toMatchObject({ alertOnModification: true, expiryDaysThreshold: 3 })
    expect((await me.put('/me/settings').send(settings)).body.data).toEqual(settings)
    expect((await me.get('/me/settings')).body.data).toEqual(settings)
    expect((await client(app).as('user-qa-1').get('/me/settings')).body.data.expiryDaysThreshold).toBe(3)
  })

  it('works for a user without a role, and validates the values', async () => {
    await client(app).as('user-admin').patch('/users/user-dev-1').send({ roleId: null })
    const me = client(app).as('user-dev-1')
    expect((await me.get('/me/settings')).status).toBe(200)
    expect((await me.put('/me/settings').send({ ...settings, expiryDaysThreshold: 0 })).status).toBe(400)
  })
})
