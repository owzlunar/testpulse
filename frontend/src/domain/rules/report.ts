import type { Defect, DefectCause, DefectSeverity, Project, ProjectReport, TestCase, TestCasePriority, TestRun } from '@/types'
import { isOpenDefect } from './defect.js'
import { currentResultOf, latestEnvironmentResults, runCounts } from './run.js'
import { caseStatsOf, isHighChurn, isOverdue } from './test-case.js'

const PRIORITIES: TestCasePriority[] = ['critical', 'high', 'medium', 'low']
const SEVERITIES: DefectSeverity[] = ['critical', 'major', 'minor', 'trivial']

const countBy = <K extends string, T>(keys: K[], items: T[], keyOf: (item: T) => K) =>
  Object.fromEntries(keys.map((k) => [k, items.filter((i) => keyOf(i) === k).length])) as Record<K, number>

const pick = ({ total, executed, passRate }: ReturnType<typeof runCounts>) => ({ total, executed, passRate })

const CAUSES: DefectCause[] = ['code', 'environment']
const HOUR = 3_600_000

/** each environment's results over the cases: the primary one is their status, the others their latest result there */
function environmentResults(project: Pick<Project, 'environments'>, cases: TestCase[], runs: TestRun[]): ProjectReport['environments'] {
  return (project.environments ?? []).map((env) => {
    const latest = env.primary ? null : latestEnvironmentResults(runs, env.id, project)
    const statuses = cases.map((c) => (latest ? currentResultOf(c, latest)?.status : c.status))
    const passed = statuses.filter((s) => s === 'passed').length
    const failed = statuses.filter((s) => s === 'failed').length
    const blocked = statuses.filter((s) => s === 'blocked').length
    return {
      id: env.id,
      name: env.name,
      primary: env.primary,
      passed,
      failed,
      blocked,
      notRun: cases.length - passed - failed - blocked,
      passRate: cases.length ? (passed / cases.length) * 100 : 0,
    }
  })
}

/** code vs server problems: how many, how many open, average hours from report to the first "fixed" */
function defectsByCause(defects: Defect[]): ProjectReport['defects']['byCause'] {
  return Object.fromEntries(
    CAUSES.map((cause) => {
      const of = defects.filter((d) => (d.cause ?? 'code') === cause)
      const fixed = of.filter((d) => d.fixedAt)
      const hours = fixed.reduce((sum, d) => sum + (Date.parse(d.fixedAt!) - Date.parse(d.createdAt)) / HOUR, 0)
      return [
        cause,
        { total: of.length, open: of.filter(isOpenDefect).length, avgFixHours: fixed.length ? Math.round((hours / fixed.length) * 10) / 10 : null },
      ]
    }),
  ) as ProjectReport['defects']['byCause']
}

/** a project's report, from its active (not archived) cases, its runs and its defects */
export function projectReport(
  project: Pick<Project, 'id' | 'environments'>,
  cases: TestCase[],
  runs: TestRun[],
  defects: Defect[],
  generatedAt = new Date().toISOString(),
): ProjectReport {
  const rootCauses = new Map<string, number>()
  cases.forEach((c) => c.rootCauseTag && rootCauses.set(c.rootCauseTag, (rootCauses.get(c.rootCauseTag) ?? 0) + 1))
  const latest: TestRun | undefined = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const open = defects.filter(isOpenDefect)

  return {
    projectId: project.id,
    generatedAt,
    stats: caseStatsOf(cases),
    mainCases: cases.filter((c) => !c.parentId).length,
    subCases: cases.filter((c) => !!c.parentId).length,
    steps: cases.reduce((sum, c) => sum + c.steps.length, 0),
    overdue: cases.filter(isOverdue).length,
    highChurn: cases.filter(isHighChurn).length,
    byPriority: countBy(PRIORITIES, cases, (c) => c.priority),
    rootCauses: [...rootCauses.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    runs: {
      total: runs.length,
      open: runs.filter((r) => r.status !== 'completed').length,
      latest: latest && { id: latest.id, name: latest.name, round: latest.round, status: latest.status, ...pick(runCounts(latest)) },
    },
    defects: {
      total: defects.length,
      open: open.length,
      openBySeverity: countBy(SEVERITIES, open, (d) => d.severity),
      byCause: defectsByCause(defects),
    },
    environments: environmentResults(project, cases, runs),
  }
}
