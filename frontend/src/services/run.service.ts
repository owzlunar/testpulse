import type {
  Actor,
  Option,
  ResultStatus,
  RunResult,
  RunResultSaveResult,
  RunStatus,
  RunType,
  StepResult,
  TestCase,
  TestCaseStatus,
  TestRun,
  TestRunInput,
} from '@/types'
import { addDays, todayISO } from '@/utils/date'
import { ApiError, newId, respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan } from './project.service'
import { STORAGE_KEYS, load, save } from './storage.service'
import { patchStoredCase, storedCase } from './test-case.service'

export const RUN_TYPES: Option<RunType>[] = [
  { value: 'smoke', label: 'Smoke', hint: 'ตรวจฟังก์ชันหลักหลัง Deploy', tone: 'info', icon: 'tabler:flame' },
  { value: 'functional', label: 'Functional', hint: 'ทดสอบตาม Requirement', tone: 'primary', icon: 'tabler:puzzle' },
  { value: 'regression', label: 'Regression', hint: 'ทดสอบซ้ำหลังแก้ Bug', tone: 'caution', icon: 'tabler:refresh' },
  { value: 'uat', label: 'UAT', hint: 'ผู้ใช้ตรวจรับระบบ', tone: 'success', icon: 'tabler:certificate' },
]

export const RUN_STATUSES: Option<RunStatus>[] = [
  { value: 'planned', label: 'วางแผนแล้ว', tone: 'secondary', icon: 'tabler:calendar' },
  { value: 'in_progress', label: 'กำลังทดสอบ', tone: 'warning', icon: 'tabler:player-play' },
  { value: 'completed', label: 'เสร็จสิ้น', tone: 'success', icon: 'tabler:flag-check' },
]

export const RESULT_STATUSES: Option<ResultStatus>[] = [
  { value: 'passed', label: 'Pass', hint: 'ผ่าน', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'failed', label: 'Fail', hint: 'ไม่ผ่าน', tone: 'error', icon: 'tabler:circle-x' },
  { value: 'blocked', label: 'Blocked', hint: 'ทดสอบไม่ได้', tone: 'caution', icon: 'tabler:ban' },
  { value: 'skipped', label: 'Skip', hint: 'ข้าม', tone: 'secondary', icon: 'tabler:player-skip-forward' },
  { value: 'untested', label: 'ยังไม่ทดสอบ', tone: 'secondary', icon: 'tabler:circle-dashed' },
]

export const runTypeOf = (v: RunType) => RUN_TYPES.find((t) => t.value === v) ?? RUN_TYPES[1]
export const runStatusOf = (v: RunStatus) => RUN_STATUSES.find((s) => s.value === v) ?? RUN_STATUSES[0]
export const resultOf = (v: ResultStatus) => RESULT_STATUSES.find((r) => r.value === v) ?? RESULT_STATUSES[4]

/** overall case result from its step results: any fail > any block > all pass/skip */
export function deriveResult(steps: StepResult[]): ResultStatus {
  if (!steps.length || steps.every((s) => s.status === 'untested')) return 'untested'
  if (steps.some((s) => s.status === 'failed')) return 'failed'
  if (steps.some((s) => s.status === 'blocked')) return 'blocked'
  if (steps.some((s) => s.status === 'untested')) return 'untested'
  return steps.every((s) => s.status === 'skipped') ? 'skipped' : 'passed'
}

export function runCounts(run: TestRun): Record<ResultStatus, number> & { total: number; executed: number; passRate: number } {
  const c = { passed: 0, failed: 0, blocked: 0, skipped: 0, untested: 0 } as Record<ResultStatus, number>
  run.results.forEach((r) => c[r.status]++)
  const total = run.results.length
  return { ...c, total, executed: total - c.untested, passRate: total ? (c.passed / total) * 100 : 0 }
}

/** snapshot of a case for a run */
export const resultFor = (tc: TestCase, assignee?: string): RunResult => ({
  caseId: tc.id,
  caseName: tc.name,
  caseVersion: tc.version,
  priority: tc.priority,
  steps: tc.steps,
  assignee: assignee ?? tc.assignedTo,
  status: 'untested',
  stepResults: tc.steps.map((s) => ({ stepId: s.id, status: 'untested', actual: '', evidence: [] })),
  actualResults: '',
  evidence: [],
  defectIds: [],
  notes: '',
})

// --- seed: two rounds on the demo project, built from the seeded cases ---------------------
function seedRuns(): TestRun[] {
  const cases = load<TestCase[]>(STORAGE_KEYS.testCases, []).filter((c) => c.projectId === 'proj-1')
  if (!cases.length) return []
  const exec = (r: RunResult, status: ResultStatus, by: string, at: string, actual = '', failAt = -1): RunResult => ({
    ...r,
    status,
    executedBy: by,
    executedAt: at,
    actualResults: actual,
    stepResults: r.stepResults.map((s, i) => ({
      ...s,
      status: failAt === i ? 'failed' : failAt >= 0 && i > failAt ? 'untested' : 'passed',
      actual: failAt === i ? actual : '',
    })),
  })
  const round1 = cases.map((c) => resultFor(c))
  const qa = 'สมชาย ประเสริฐ (QA Lead)'
  return [
    {
      id: 'run-1',
      projectId: 'proj-1',
      name: 'Sprint 42 · Functional',
      type: 'functional',
      round: 1,
      environment: 'Staging',
      build: 'v3.2.0-rc1',
      status: 'completed',
      plannedStart: '2026-09-21',
      plannedEnd: '2026-09-25',
      startedAt: '2026-09-21T09:00:00Z',
      completedAt: '2026-09-25T17:00:00Z',
      createdBy: qa,
      createdAt: '2026-09-20T10:00:00Z',
      results: round1.map((r) =>
        r.caseId === 'TC-103'
          ? {
              ...exec(r, 'failed', qa, '2026-09-23T14:20:00Z', 'พบรายการซ้ำ 2 รายการเมื่อยิง Webhook พร้อมกัน', r.steps.length - 1),
              defectIds: ['BUG-001'],
            }
          : r.caseId === 'TC-104'
            ? exec(r, 'blocked', qa, '2026-09-24T10:00:00Z', 'Sandbox DLQ ยังไม่พร้อม', 0)
            : exec(r, 'passed', qa, '2026-09-22T11:00:00Z'),
      ),
    },
    {
      id: 'run-2',
      projectId: 'proj-1',
      name: 'Sprint 42 · Regression',
      type: 'regression',
      round: 2,
      environment: 'Staging',
      build: 'v3.2.0-rc2',
      status: 'in_progress',
      plannedStart: addDays(todayISO(), -2),
      plannedEnd: addDays(todayISO(), 3),
      startedAt: `${addDays(todayISO(), -2)}T09:00:00Z`,
      createdBy: qa,
      createdAt: `${addDays(todayISO(), -3)}T10:00:00Z`,
      results: round1.map((r) => (r.caseId.startsWith('TC-101') ? exec(r, 'passed', qa, `${addDays(todayISO(), -1)}T10:30:00Z`) : r)),
    },
  ]
}

// --- API ------------------------------------------------------------------------
function runs(): TestRun[] {
  const stored = localStorage.getItem(STORAGE_KEYS.testRuns)
  if (stored === null) {
    const seeded = seedRuns()
    save(STORAGE_KEYS.testRuns, seeded)
    return seeded
  }
  return load<TestRun[]>(STORAGE_KEYS.testRuns, [])
}

const find = (list: TestRun[], id: string) => {
  const run = list.find((r) => r.id === id)
  if (!run) throw new ApiError('ไม่พบรอบการทดสอบ', 404)
  return run
}

/** server-side: follow renumbered case ids (old id -> new id) in every run of the project */
export function renameRunCases(projectId: string, renames: Record<string, string>) {
  const list = runs()
  list
    .filter((r) => r.projectId === projectId)
    .forEach((run) =>
      run.results.forEach((r) => {
        if (!r.caseDeleted) r.caseId = renames[r.caseId] ?? r.caseId
      }),
    )
  save(STORAGE_KEYS.testRuns, list)
}

/** server-side: results of deleted cases stay in their runs as history, detached from the id */
export function detachRunCases(projectId: string, caseIds: string[]) {
  const list = runs()
  list
    .filter((r) => r.projectId === projectId)
    .forEach((run) =>
      run.results.forEach((r) => {
        if (caseIds.includes(r.caseId)) r.caseDeleted = true
      }),
    )
  save(STORAGE_KEYS.testRuns, list)
}

/** server-side: the stored runs of a project */
export const runsOf = (projectId: string): TestRun[] => runs().filter((r) => r.projectId === projectId)

/** GET /test-runs (of the projects the signed-in user may open) */
export const fetchRuns = () => respond(() => (sessionCan('run.view') ? inAccessibleProjects(runs()) : []))

/** POST /projects/:projectId/test-runs (the server snapshots the selected cases) */
export const createRun = (input: TestRunInput, cases: TestCase[], createdBy: string) =>
  respond(() => {
    assertCan('run.create', input.projectId)
    const run: TestRun = {
      id: newId('run'),
      projectId: input.projectId,
      name: input.name,
      type: input.type,
      round: input.round,
      environment: input.environment,
      build: input.build,
      plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd,
      status: 'planned',
      createdBy,
      createdAt: new Date().toISOString(),
      results: cases.filter((c) => input.caseIds.includes(c.id)).map((c) => resultFor(c, input.assignee)),
    }
    save(STORAGE_KEYS.testRuns, [run, ...runs()])
    return run
  })

/** PATCH /test-runs/:id (status, dates …) */
export const updateRun = (id: string, patch: Partial<Omit<TestRun, 'results'>>) =>
  respond(() => {
    const list = runs()
    const run = find(list, id)
    // closing a run is its own permission; other changes are planning
    assertCan(patch.status === 'completed' && run.status !== 'completed' ? 'run.close' : 'run.create', run.projectId)
    Object.assign(run, patch)
    save(STORAGE_KEYS.testRuns, list)
    return find(list, id)
  })

/** a run verdict that also becomes the case's current status */
const CASE_STATUS: Partial<Record<ResultStatus, TestCaseStatus>> = { passed: 'passed', failed: 'failed', blocked: 'blocked' }

/**
 * Why a verdict in this run must not change the case's current status, or null when it may.
 * The case status is "the latest result for the current spec": a closed run, a deleted case,
 * a result for an older version or a run that a newer one has superseded only keep their history.
 * Used by the server (saveResult) and by Execute to explain it.
 */
export function caseSyncBlock(run: TestRun, result: RunResult, tc: TestCase | undefined, allRuns: TestRun[]): string | null {
  if (result.caseDeleted) return 'Test Case นี้ถูกลบแล้ว'
  if (run.status === 'completed') return 'รอบนี้ปิดแล้ว'
  if (!tc) return 'ไม่พบ Test Case'
  if (tc.archivedAt) return 'Test Case นี้อยู่ในคลังเก็บ'
  if (tc.version !== result.caseVersion) return `ผลนี้ทดสอบกับ ${result.caseVersion} แต่เคสเป็น ${tc.version} แล้ว`
  const newer = allRuns.find(
    (r) =>
      r.projectId === run.projectId &&
      r.id !== run.id &&
      r.createdAt > run.createdAt &&
      r.results.some((x) => x.caseId === result.caseId && !x.caseDeleted && x.status !== 'untested'),
  )
  return newer ? `มีผลที่ใหม่กว่าใน ${newer.name} รอบที่ ${newer.round}` : null
}

/**
 * PUT /test-runs/:id/results/:caseId
 * Stamps who ran it; when caseSyncBlock allows, the verdict also becomes the case status
 * (same rules as a case update: see applyCasePatch).
 */
export const saveResult = (runId: string, result: RunResult, actor: Actor) =>
  respond<RunResultSaveResult>(() => {
    const list = runs()
    const run = find(list, runId)
    assertCan('run.execute', run.projectId)
    if (run.status === 'completed') throw new ApiError('รอบนี้ปิดแล้ว แก้ไขผลไม่ได้', 409)
    const i = run.results.findIndex((r) => r.caseId === result.caseId)
    if (i < 0) throw new ApiError(`${result.caseId} ไม่อยู่ในรอบนี้`, 404)
    const stamped: RunResult = { ...result, caseDeleted: run.results[i].caseDeleted, executedBy: actor.name, executedAt: new Date().toISOString() }
    run.results[i] = stamped
    if (run.status === 'planned') {
      run.status = 'in_progress'
      run.startedAt = stamped.executedAt
    }
    save(STORAGE_KEYS.testRuns, list)

    const caseStatus = CASE_STATUS[stamped.status]
    const tc = stamped.caseDeleted ? undefined : storedCase(run.projectId, stamped.caseId)
    const caseUpdate =
      caseStatus && tc && tc.status !== caseStatus && !caseSyncBlock(run, stamped, tc, list)
        ? patchStoredCase(
            run.projectId,
            tc.id,
            {
              status: caseStatus,
              actualResults: stamped.actualResults || tc.actualResults,
              executedBy: stamped.executedBy,
              executedAt: stamped.executedAt,
            },
            actor,
          )
        : null
    return { run, caseUpdate }
  })

/** DELETE /test-runs/:id */
export const deleteRun = (id: string) =>
  respond(() => {
    const list = runs()
    assertCan('run.create', find(list, id).projectId)
    save(
      STORAGE_KEYS.testRuns,
      list.filter((r) => r.id !== id),
    )
  })
