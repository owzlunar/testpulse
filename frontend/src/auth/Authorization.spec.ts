import { describe, expect, it } from 'vitest'
import type { RouteMeta } from 'vue-router'
import type { Role } from '@/types'
import { Authorization } from './Authorization'

const role = (id: string, permissions: Role['permissions'], builtIn?: Role['builtIn']): Role => ({
  id,
  name: id,
  description: '',
  discipline: 'qa',
  tone: 'primary',
  icon: 'tabler:user',
  permissions,
  builtIn,
  createdAt: '',
  updatedAt: '',
})
const route = (...metas: RouteMeta[]) => ({ matched: metas.map((meta) => ({ meta })) })

describe('Authorization', () => {
  const tester = new Authorization([role('r-tester', ['case.view', 'run.execute'])])
  const admin = new Authorization([role('r-admin', [], 'admin')])
  const nobody = new Authorization([])

  it('has the permissions of its roles only', () => {
    expect(tester.hasPermission('case.view')).toBe(true)
    expect(tester.hasPermission('case.delete')).toBe(false)
    expect(tester.hasAnyPermission(['case.delete', 'run.execute'])).toBe(true)
    expect(tester.hasAllPermissions(['case.view', 'case.delete'])).toBe(false)
    expect(nobody.hasPermission('case.view')).toBe(false)
  })

  it('gives the built-in Admin every permission and its role code', () => {
    expect(admin.hasPermission('case.delete')).toBe(true)
    expect(admin.hasRole('admin')).toBe(true)
    expect(admin.hasRole('r-admin')).toBe(true)
    expect(tester.hasRole('admin')).toBe(false)
  })

  it('opens a route when every matched record allows it', () => {
    expect(tester.canOpen(route({}))).toBe(true)
    expect(tester.canOpen(route({ permissions: ['case.view'] }))).toBe(true)
    expect(tester.canOpen(route({ permissions: ['case.view', 'case.delete'] }))).toBe(false)
    // a role restriction holds even with the permission
    expect(tester.canOpen(route({ roles: ['admin'], permissions: ['case.view'] }))).toBe(false)
    expect(admin.canOpen(route({ roles: ['admin'] }))).toBe(true)
    // a parent record's restriction applies to its children
    expect(tester.canOpen(route({ roles: ['admin'] }, { permissions: ['case.view'] }))).toBe(false)
    expect(nobody.canOpen(route({ permissions: ['case.view'] }))).toBe(false)
  })
})
