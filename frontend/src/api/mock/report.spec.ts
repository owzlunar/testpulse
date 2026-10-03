import { describe, expect, it } from 'vitest'
import { caseStatsOf } from '@/domain/test-case'
import { fetchProjectReport } from './report'
import { storedCases } from './test-case'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// A project's report counts its active cases the way the project card does

const PAY = 'proj-1'

describe('fetchProjectReport', () => {
  it('counts the active cases like the project card, and splits main / sub-cases', async () => {
    await signIn(USERS.admin)
    const active = storedCases().filter((c) => c.projectId === PAY && !c.archivedAt)
    const report = await fetchProjectReport(PAY)
    expect(report.stats).toEqual(caseStatsOf(active))
    expect(report.mainCases + report.subCases).toBe(active.length)
    expect(report.rootCauses.map((r) => r.count)).toEqual([...report.rootCauses.map((r) => r.count)].sort((a, b) => b - a))
    expect(report.runs.latest?.total).toBeGreaterThan(0)
  })

  it('needs the project', async () => {
    await signIn(USERS.tester)
    expect((await refusal(fetchProjectReport(PAY))).status).toBe(403)
    await signIn(USERS.admin)
    expect((await refusal(fetchProjectReport('proj-404'))).status).toBe(404)
  })
})
