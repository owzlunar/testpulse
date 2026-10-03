import { describe, expect, it } from 'vitest'
import { searchDefects } from './defect'
import { searchRuns } from './run'
import { searchTestCases } from './test-case'
import { USERS, signIn } from '../../../tests/helpers'

// The universal search pages every group by offset, in the projects the user may open

describe('universal search', () => {
  it('pages by offset: the pages together are the whole list', async () => {
    await signIn(USERS.admin)
    const all = await searchTestCases('TC-', 100)
    const first = await searchTestCases('TC-', 2, 0)
    const second = await searchTestCases('TC-', 2, 2)
    expect([...first.cases, ...second.cases].map((c) => c.uid)).toEqual(all.cases.slice(0, 4).map((c) => c.uid))
    expect(second.total).toBe(all.total)
  })

  it('defects newest first; runs without their results; only what the user may see', async () => {
    await signIn(USERS.admin)
    const { defects } = await searchDefects('BUG')
    expect(defects.map((d) => d.createdAt)).toEqual([...defects.map((d) => d.createdAt)].sort().reverse())
    const { runs } = await searchRuns('Sprint')
    expect(runs.length).toBeGreaterThan(0)
    expect(runs[0]).not.toHaveProperty('results')

    await signIn(USERS.tester)
    expect((await searchDefects('BUG')).defects.every((d) => d.projectId !== 'proj-1')).toBe(true)
  })
})
