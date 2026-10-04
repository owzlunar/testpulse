import { describe, expect, it } from 'vitest'
import { createProject, fetchProjects } from './project'
import type { ProjectInput } from '@/types'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// A project key is 2 to 16 upper-case letters or digits (the same rule as the backend's validation)

const input = (key: string, over: Partial<ProjectInput> = {}): ProjectInput => ({
  key,
  name: key,
  description: '',
  status: 'active',
  tags: [],
  environments: [],
  ...over,
})

describe('project key', () => {
  it('takes 2 to 16 upper-case letters or digits', async () => {
    await signIn(USERS.admin)
    await createProject(input('SHOP2026PLATFORM'))
    expect((await fetchProjects()).map((p) => p.key)).toContain('SHOP2026PLATFORM')
    for (const key of ['A', 'SHOP2026PLATFORMX', 'MY-APP']) expect((await refusal(createProject(input(key)))).status).toBe(400)
  })
})

describe('project environments', () => {
  it('a new project starts with TEST as its primary environment', async () => {
    await signIn(USERS.admin)
    expect((await createProject(input('ENVA'))).environments).toEqual([{ id: 'env-test', name: 'TEST', primary: true }])
  })

  it('keeps exactly one primary and different names', async () => {
    await signIn(USERS.admin)
    const env = (id: string, name: string, primary: boolean) => ({ id, name, primary })
    const twoPrimaries = [env('e1', 'TEST', true), env('e2', 'STAGING', true)]
    expect(await refusal(createProject(input('ENVB', { environments: twoPrimaries })))).toMatchObject({ status: 422 })
    const sameName = [env('e1', 'TEST', true), env('e2', 'test', false)]
    expect(await refusal(createProject(input('ENVC', { environments: sameName })))).toMatchObject({ status: 422 })
    const ok = await createProject(input('ENVD', { environments: [env('e1', ' TEST ', true), env('e2', 'STAGING', false)] }))
    expect(ok.environments.map((e) => e.name)).toEqual(['TEST', 'STAGING'])
  })
})
