import { describe, expect, it } from 'vitest'
import { createProject, fetchProjects } from './project'
import type { ProjectInput } from '@/types'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// A project key is 2 to 16 upper-case letters or digits (the same rule as the backend's validation)

const input = (key: string) => ({ key, name: key, description: '', status: 'active', tags: [] }) as ProjectInput

describe('project key', () => {
  it('takes 2 to 16 upper-case letters or digits', async () => {
    await signIn(USERS.admin)
    await createProject(input('SHOP2026PLATFORM'))
    expect((await fetchProjects()).map((p) => p.key)).toContain('SHOP2026PLATFORM')
    for (const key of ['A', 'SHOP2026PLATFORMX', 'MY-APP']) expect((await refusal(createProject(input(key)))).status).toBe(400)
  })
})
