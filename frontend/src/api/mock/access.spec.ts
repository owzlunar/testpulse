import { describe, expect, it } from 'vitest'
import { saveDefect } from './defect'
import { createProject, fetchProjects } from './project'
import { saveRequirement } from './requirement'
import { deleteRole, fetchRoles, saveRole } from './role'
import { deleteTestCase, fetchTestCases, reorderTestCases, storedCase, updateTestCase } from './test-case'
import { updateUser } from './user'
import type { Defect, ProjectInput, Requirement } from '@/types'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// The server refuses what a role may not do (403) and only returns the projects a user may open.
// Seed: PAY (proj-1) = team Payment, SHOP (proj-2) = team E-Commerce, AUTH (proj-3) = no team.

const projectIds = async () => (await fetchProjects()).map((p) => p.id).sort()

describe('project access by team', () => {
  it('Admin opens every project', async () => {
    await signIn(USERS.admin)
    expect(await projectIds()).toEqual(['proj-1', 'proj-2', 'proj-3'])
  })

  it('a member opens their team projects and the ones without a team', async () => {
    await signIn(USERS.tester) // E-Commerce
    expect(await projectIds()).toEqual(['proj-2', 'proj-3'])
    expect(new Set((await fetchTestCases('proj-2')).map((c) => c.projectId))).not.toContain('proj-1')
  })

  it('a user without a role opens nothing', async () => {
    await signIn(USERS.admin)
    await updateUser(USERS.tester, { roleId: null })
    await signIn(USERS.tester)
    expect(await projectIds()).toEqual([])
  })

  it('writing to another team project is refused even with the permission', async () => {
    const actor = await signIn(USERS.tester)
    const { status, message } = await refusal(updateTestCase('proj-1', 'TC-104', { name: 'x' }, actor))
    expect(status).toBe(403)
    expect(message).toContain('ทีม')
  })
})

describe('permissions', () => {
  it('QA Tester may not reorder or delete; QA Lead may reorder', async () => {
    await signIn(USERS.tester)
    expect((await refusal(reorderTestCases('proj-2', []))).status).toBe(403)
    expect((await refusal(deleteTestCase('proj-2', 'TC-201'))).status).toBe(403)
    await signIn(USERS.qaLead)
    const order = (await fetchTestCases('proj-1'))
      .filter((c) => !c.parentId)
      .map((c) => ({ id: c.id, subIds: c.id === 'TC-101' ? ['TC-101-1'] : [] }))
    await expect(reorderTestCases('proj-1', order.reverse())).resolves.toBeTruthy()
  })

  it('Developer hands off but may not give verdicts or edit the spec', async () => {
    const actor = await signIn(USERS.dev)
    await expect(updateTestCase('proj-1', 'TC-104', { status: 'ready_for_test' }, actor)).resolves.toBeTruthy()
    expect((await refusal(updateTestCase('proj-1', 'TC-104', { status: 'passed' }, actor))).status).toBe(403)
    expect((await refusal(updateTestCase('proj-1', 'TC-104', { name: 'x' }, actor))).status).toBe(403)
  })

  it('closing a defect needs defect.resolve; progress updates need defect.report', async () => {
    await signIn(USERS.dev)
    const bug = {
      id: 'BUG-003',
      projectId: 'proj-1',
      title: 'x',
      severity: 'major',
      assignee: '',
      environment: '',
      evidence: [],
    } as unknown as Defect
    await expect(saveDefect({ ...bug, status: 'in_progress' }, 'dev')).resolves.toBeTruthy()
    expect((await refusal(saveDefect({ ...bug, status: 'closed' }, 'dev'))).status).toBe(403)
  })

  it('only Admins manage projects, roles and user roles', async () => {
    await signIn(USERS.qaLead)
    const project = { key: 'X', name: 'X', description: '', status: 'active', tags: [] } as ProjectInput
    expect((await refusal(createProject(project))).status).toBe(403)
    expect((await refusal(updateUser(USERS.qaLead, { roleId: 'role-admin' }))).status).toBe(403)
    const role = { name: 'Hacker', description: '', discipline: 'qa', tone: 'error', icon: 'tabler:user', permissions: [] } as const
    expect((await refusal(saveRole({ ...role, permissions: [] }))).status).toBe(403)
  })
})

describe('roles', () => {
  it('a copy of Admin is an ordinary role, and no request can make one built-in', async () => {
    await signIn(USERS.admin)
    const admin = (await fetchRoles()).find((r) => r.builtIn === 'admin')!
    const copy = await saveRole({ ...admin, id: undefined, name: 'Manager' })
    expect(copy.builtIn).toBeUndefined()
    const tester = (await fetchRoles()).find((r) => r.id === 'role-qa-tester')!
    expect((await saveRole({ ...tester, builtIn: 'admin' } as typeof tester)).builtIn).toBeUndefined()
  })

  it('the last Admin keeps the Admin role; the Admin role cannot be deleted', async () => {
    await signIn(USERS.admin)
    expect((await refusal(updateUser(USERS.admin, { roleId: 'role-qa-lead' }))).status).toBe(409)
    expect((await refusal(deleteRole('role-admin', null))).status).toBe(409)
  })

  it('deleting a role moves its users', async () => {
    await signIn(USERS.admin)
    const moved = await deleteRole('role-dev', 'role-qa-tester')
    expect(moved.map((u) => u.id).sort()).toEqual([USERS.dev, USERS.devBoth].sort())
  })
})

describe('requirement changes flag linked cases for review', () => {
  it('a new title flags the case; a priority change does not', async () => {
    await signIn(USERS.admin)
    const { fetchRequirements } = await import('./requirement')
    const req = (await fetchRequirements()).find((r) => r.code === 'REQ-PAY-01') as Requirement
    expect((await saveRequirement({ ...req, priority: 'low' })).flaggedCases).toHaveLength(0)
    const { flaggedCases } = await saveRequirement({ ...req, title: 'ชื่อใหม่' })
    expect(flaggedCases.map((c) => c.id)).toContain('TC-101')
    expect(storedCase('proj-1', 'TC-101')!.reviewNeeded?.requirementCodes).toEqual(['REQ-PAY-01'])
  })
})

describe('cases load per project', () => {
  it('a project of another team is refused; project lists carry case counts without archived cases', async () => {
    await signIn(USERS.tester)
    expect((await refusal(fetchTestCases('proj-1'))).status).toBe(403)
    expect((await fetchTestCases('proj-2')).every((c) => c.projectId === 'proj-2')).toBe(true)

    await signIn(USERS.admin)
    const before = (await fetchProjects()).find((p) => p.id === 'proj-1')!.caseStats!.total
    const { archiveTestCase } = await import('./test-case')
    await archiveTestCase('proj-1', 'TC-104', await signIn(USERS.admin))
    expect((await fetchProjects()).find((p) => p.id === 'proj-1')!.caseStats!.total).toBe(before - 1)
  })

  it('search finds cases in every project the user may open, and only those', async () => {
    const { searchTestCases } = await import('./test-case')
    await signIn(USERS.admin)
    expect((await searchTestCases('TC-')).cases.map((c) => c.projectId)).toEqual(expect.arrayContaining(['proj-1', 'proj-2']))
    await signIn(USERS.tester)
    const found = await searchTestCases('TC-')
    expect(found.cases.length).toBeGreaterThan(0)
    expect(found.cases.every((c) => c.projectId !== 'proj-1')).toBe(true)
  })
})
