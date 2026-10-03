import type { Defect, DefectSeverity, ProjectReport, TestCase, TestCasePriority, TestRun } from '@/types'
import { isOpenDefect } from './defect.js'
import { runCounts } from './run.js'
import { caseStatsOf, isHighChurn, isOverdue } from './test-case.js'

const PRIORITIES: TestCasePriority[] = ['critical', 'high', 'medium', 'low']
const SEVERITIES: DefectSeverity[] = ['critical', 'major', 'minor', 'trivial']

const countBy = <K extends string, T>(keys: K[], items: T[], keyOf: (item: T) => K) =>
  Object.fromEntries(keys.map((k) => [k, items.filter((i) => keyOf(i) === k).length])) as Record<K, number>

const pick = ({ total, executed, passRate }: ReturnType<typeof runCounts>) => ({ total, executed, passRate })

/** a project's report, from its active (not archived) cases, its runs and its defects */
export function projectReport(
  projectId: string,
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
    projectId,
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
    defects: { total: defects.length, open: open.length, openBySeverity: countBy(SEVERITIES, open, (d) => d.severity) },
  }
}
