import { beforeEach, describe, expect, it } from 'vitest'
import { useTestDatabase } from '../../../tests/helpers/database.js'
import { buildApp } from '../../../tests/helpers/app.js'
import { RoleModel } from '#modules/role/role.model.js'
import { defaultRoles } from '../20261004-01-role-defaults.js'
import { opsRole } from '../20261005-03-role-ops.js'

useTestDatabase()
beforeEach(async () => {
  await buildApp()
})

const roleList = () => RoleModel.find().sort({ _id: 1 }).lean()

describe('default roles', () => {
  it('a new database gets QA Lead, QA Tester, Developer and Server/Infra with the demo permissions', async () => {
    await defaultRoles.up()
    const list = await roleList()
    expect(list.map((r) => r._id)).toEqual(['role-admin', 'role-dev', 'role-ops', 'role-qa-lead', 'role-qa-tester'])
    expect(list.find((r) => r._id === 'role-ops')).toMatchObject({ name: 'Server/Infra', discipline: 'ops' })
    expect(list.find((r) => r._id === 'role-ops')!.permissions).toContain('defect.report')
    expect(list.find((r) => r._id === 'role-ops')!.permissions).not.toEqual(expect.arrayContaining(['defect.resolve']))
    expect(list.find((r) => r._id === 'role-ops')!.permissions).not.toContain('case.edit')
    expect(list.find((r) => r._id === 'role-qa-lead')).toMatchObject({ name: 'QA Lead', discipline: 'qa' })
    expect(list.find((r) => r._id === 'role-qa-lead')!.permissions).toEqual(expect.arrayContaining(['run.close', 'defect.resolve', 'document.sign']))
    expect(list.find((r) => r._id === 'role-dev')!.permissions).toEqual(expect.arrayContaining(['case.handoff', 'defect.report']))
    expect(list.find((r) => r._id === 'role-dev')!.permissions).not.toContain('case.edit')
  })

  it('leaves roles an Admin changed, or made with the same name, as they are', async () => {
    await RoleModel.create({
      _id: 'role-dev',
      name: 'Dev ภายใน',
      description: '',
      discipline: 'dev',
      tone: 'warning',
      icon: 'tabler:code',
      permissions: ['case.view'],
    })
    await RoleModel.create({
      _id: 'role-custom',
      name: 'qa lead',
      description: '',
      discipline: 'qa',
      tone: 'info',
      icon: 'tabler:flask',
      permissions: [],
    })
    await defaultRoles.up()
    await defaultRoles.up()
    const list = await roleList()
    expect(list.find((r) => r._id === 'role-dev')).toMatchObject({ name: 'Dev ภายใน', permissions: ['case.view'] })
    expect(list.some((r) => r._id === 'role-qa-lead')).toBe(false)
    expect(list.filter((r) => r._id === 'role-qa-tester')).toHaveLength(1)
  })

  it('the later Server/Infra migration adds only that role: defaults an Admin deleted stay deleted', async () => {
    await defaultRoles.up()
    await RoleModel.deleteOne({ _id: 'role-dev' })
    await RoleModel.deleteOne({ _id: 'role-ops' })
    await opsRole.up()
    const ids = (await roleList()).map((r) => r._id)
    expect(ids).toContain('role-ops')
    expect(ids).not.toContain('role-dev')
  })
})
