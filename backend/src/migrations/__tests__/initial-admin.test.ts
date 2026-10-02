import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

// the first-start settings, before anything reads the config
process.env.INITIAL_ADMIN_EMAIL = 'Owner@Company.example'
process.env.INITIAL_ADMIN_NAME = 'เจ้าของระบบ'
process.env.INITIAL_ADMIN_PASSWORD = 'first-start-password'

const { useTestDatabase } = await import('../../../tests/helpers/database.js')
const { api, buildApp, seedDemo } = await import('../../../tests/helpers/app.js')
const { config } = await import('#core/config/env.js')
const { migrate } = await import('#core/database/migrations.js')
const { initialAdmin } = await import('../20261002-01-user-initial-admin.js')
const { migrations } = await import('../index.js')

useTestDatabase()
let app: Awaited<ReturnType<typeof buildApp>>
beforeEach(async () => {
  app ??= await buildApp()
})

const users = async () => {
  const { UserModel } = await import('#modules/user/user.model.js')
  return UserModel.find().lean()
}

describe('first Admin', () => {
  it('a new database gets the Admin from the settings, who can sign in', async () => {
    expect(await migrate(migrations)).toEqual([initialAdmin.id])
    const [admin] = await users()
    expect(admin).toMatchObject({ name: 'เจ้าของระบบ', roleId: 'role-admin', status: 'active' })

    const res = await request(app).post(api('/auth/login')).send({ email: 'owner@company.example', password: 'first-start-password' })
    expect(res.status).toBe(200)
    expect(res.body.data.user.roleId).toBe('role-admin')
  })

  it('a database that already has an Admin gets no second one', async () => {
    await seedDemo()
    await migrate(migrations)
    expect((await users()).filter((u) => u.roleId === 'role-admin')).toHaveLength(1)
  })

  it('without the settings it fails (nobody could sign in) and runs again next time', async () => {
    const saved = { ...config.initialAdmin }
    Object.assign(config.initialAdmin, { email: null, password: null })
    try {
      await expect(migrate(migrations)).rejects.toThrow(/INITIAL_ADMIN_EMAIL/)
    } finally {
      Object.assign(config.initialAdmin, saved)
    }
    expect(await migrate(migrations)).toEqual([initialAdmin.id])
  })
})
