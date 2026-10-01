import type { Option, ResultStatus, RunResult, RunStatus, RunType, StepResult, TestCase, TestRun, TestRunInput } from '@/types'
import { addDays, todayISO } from '@/utils/date'
import { ApiError, newId, respond } from './http'
import { STORAGE_KEYS, load, save } from './storage.service'

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
  caseId: tc.id, caseName: tc.name, caseVersion: tc.version, priority: tc.priority, steps: tc.steps, assignee: assignee ?? tc.assignedTo,
  status: 'untested', stepResults: tc.steps.map((s) => ({ stepId: s.id, status: 'untested', actual: '', evidence: [] })),
  actualResults: '', evidence: [], defectIds: [], notes: '',
})

// --- seed: two rounds on the demo project, built from the seeded cases ---------------------
function seedRuns(): TestRun[] {
  const cases = load<TestCase[]>(STORAGE_KEYS.testCases, []).filter((c) => c.projectId === 'proj-1')
  if (!cases.length) return []
  const exec = (r: RunResult, status: ResultStatus, by: string, at: string, actual = '', failAt = -1): RunResult => ({
    ...r, status, executedBy: by, executedAt: at, actualResults: actual,
    stepResults: r.stepResults.map((s, i) => ({ ...s, status: failAt === i ? 'failed' : failAt >= 0 && i > failAt ? 'untested' : 'passed', actual: failAt === i ? actual : '' })),
  })
  const round1 = cases.map((c) => resultFor(c))
  const qa = 'สมชาย ประเสริฐ (QA Lead)'
  return [
    {
      id: 'run-1', projectId: 'proj-1', name: 'Sprint 42 · Functional', type: 'functional', round: 1, environment: 'Staging', build: 'v3.2.0-rc1',
      status: 'completed', plannedStart: '2026-09-21', plannedEnd: '2026-09-25', startedAt: '2026-09-21T09:00:00Z', completedAt: '2026-09-25T17:00:00Z',
      createdBy: qa, createdAt: '2026-09-20T10:00:00Z',
      results: round1.map((r) =>
        r.caseId === 'TC-103' ? { ...exec(r, 'failed', qa, '2026-09-23T14:20:00Z', 'พบรายการซ้ำ 2 รายการเมื่อยิง Webhook พร้อมกัน', r.steps.length - 1), defectIds: ['BUG-001'] }
        : r.caseId === 'TC-104' ? exec(r, 'blocked', qa, '2026-09-24T10:00:00Z', 'Sandbox DLQ ยังไม่พร้อม', 0)
        : exec(r, 'passed', qa, '2026-09-22T11:00:00Z')),
    },
    {
      id: 'run-2', projectId: 'proj-1', name: 'Sprint 42 · Regression', type: 'regression', round: 2, environment: 'Staging', build: 'v3.2.0-rc2',
      status: 'in_progress', plannedStart: addDays(todayISO(), -2), plannedEnd: addDays(todayISO(), 3), startedAt: `${addDays(todayISO(), -2)}T09:00:00Z`,
      createdBy: qa, createdAt: `${addDays(todayISO(), -3)}T10:00:00Z`,
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
  list.filter((r) => r.projectId === projectId).forEach((run) => run.results.forEach((r) => {
    if (!r.caseDeleted) r.caseId = renames[r.caseId] ?? r.caseId
  }))
  save(STORAGE_KEYS.testRuns, list)
}

/** server-side: results of deleted cases stay in their runs as history, detached from the id */
export function detachRunCases(projectId: string, caseIds: string[]) {
  const list = runs()
  list.filter((r) => r.projectId === projectId).forEach((run) => run.results.forEach((r) => {
    if (caseIds.includes(r.caseId)) r.caseDeleted = true
  }))
  save(STORAGE_KEYS.testRuns, list)
}

/** GET /test-runs */
export const fetchRuns = () => respond(runs)

/** POST /projects/:projectId/test-runs (the server snapshots the selected cases) */
export const createRun = (input: TestRunInput, cases: TestCase[], createdBy: string) =>
  respond(() => {
    const run: TestRun = {
      id: newId('run'), projectId: input.projectId, name: input.name, type: input.type, round: input.round,
      environment: input.environment, build: input.build, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd,
      status: 'planned', createdBy, createdAt: new Date().toISOString(),
      results: cases.filter((c) => input.caseIds.includes(c.id)).map((c) => resultFor(c, input.assignee)),
    }
    save(STORAGE_KEYS.testRuns, [run, ...runs()])
    return run
  })

/** PATCH /test-runs/:id (status, dates …) */
export const updateRun = (id: string, patch: Partial<Omit<TestRun, 'results'>>) =>
  respond(() => {
    const list = runs()
    Object.assign(find(list, id), patch)
    save(STORAGE_KEYS.testRuns, list)
    return find(list, id)
  })

/** PUT /test-runs/:id/results/:caseId */
export const saveResult = (runId: string, result: RunResult) =>
  respond(() => {
    const list = runs()
    const run = find(list, runId)
    const i = run.results.findIndex((r) => r.caseId === result.caseId)
    if (i < 0) throw new ApiError(`${result.caseId} ไม่อยู่ในรอบนี้`, 404)
    run.results[i] = result
    if (run.status === 'planned') {
      run.status = 'in_progress'
      run.startedAt = new Date().toISOString()
    }
    save(STORAGE_KEYS.testRuns, list)
    return run
  })

/** DELETE /test-runs/:id */
export const deleteRun = (id: string) => respond(() => save(STORAGE_KEYS.testRuns, runs().filter((r) => r.id !== id)))
