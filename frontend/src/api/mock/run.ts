import type { Actor, ResultStatus, RunResult, RunResultSaveResult, RunSearchHit, TestCase, TestCaseStatus, TestRun, TestRunInput } from '@/types'
import { ApiError } from '@/api/errors'
import { environmentOf } from '@/domain/project'
import { caseSyncBlock, resultFor } from '@/domain/run'
import { addDays, todayISO } from '@/utils/date'
import { newId } from '@/utils/ids'
import { respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan, storedProjects } from './project'
import { STORAGE_KEYS, load, save } from './storage'
import { patchStoredCase, storedCase, storedCases } from './test-case'

// --- seed: two rounds on the demo project, built from the seeded cases ---------------------
function seedRuns(): TestRun[] {
  const cases = storedCases().filter((c) => c.projectId === 'proj-1')
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
      environmentId: 'env-test',
      environment: 'TEST',
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
      environmentId: 'env-test',
      environment: 'TEST',
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

/** server-side: the project, for its environments */
function projectOf(projectId: string) {
  const project = storedProjects().find((p) => p.id === projectId)
  if (!project) throw new ApiError('ไม่พบโปรเจกต์', 404)
  return project
}

/** server-side: one of the project's environments (runs pick from the list, no free text) */
function environmentFor(projectId: string, environmentId: string) {
  const env = environmentOf(projectOf(projectId), environmentId)
  if (!env) throw new ApiError('ไม่พบ Environment นี้ในโปรเจกต์', 422)
  return env
}

/** GET /test-runs (of the projects the signed-in user may open) */
export const fetchRuns = () => respond(() => (sessionCan('run.view') ? inAccessibleProjects(runs()) : []))

/** GET /test-runs/search?q=:q&limit=:limit&offset=:offset */
export const searchRuns = (q: string, limit = 20, offset = 0) =>
  respond(() => {
    const text = q.trim().toLowerCase()
    if (!text || !sessionCan('run.view')) return { runs: [] as RunSearchHit[], total: 0 }
    const found = inAccessibleProjects(runs())
      .filter((r) => `${r.name} ${r.environment} ${r.build}`.toLowerCase().includes(text))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const hits = found.slice(offset, offset + limit).map(({ id, projectId, name, round, type, status, environment, build, createdAt }) => ({
      id,
      projectId,
      name,
      round,
      type,
      status,
      environment,
      build,
      createdAt,
    }))
    return { runs: hits, total: found.length }
  })

/** POST /projects/:projectId/test-runs (the server snapshots the selected cases) */
export const createRun = (input: TestRunInput, cases: TestCase[], createdBy: string) =>
  respond(() => {
    assertCan('run.create', input.projectId)
    const env = environmentFor(input.projectId, input.environmentId)
    const run: TestRun = {
      id: newId('run'),
      projectId: input.projectId,
      name: input.name,
      type: input.type,
      round: input.round,
      environmentId: env.id,
      environment: env.name,
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
    // the environment's name is the server's; results already recorded stay on the environment they were made on
    const { environment: _name, ...fields } = patch
    if (fields.environmentId && fields.environmentId !== run.environmentId) {
      if (run.results.some((r) => r.status !== 'untested')) throw new ApiError('รอบนี้มีผลการทดสอบแล้ว เปลี่ยน Environment ไม่ได้', 409)
      Object.assign(fields, { environment: environmentFor(run.projectId, fields.environmentId).name })
    }
    Object.assign(run, fields)
    save(STORAGE_KEYS.testRuns, list)
    return find(list, id)
  })

/** a run verdict that also becomes the case's current status */
const CASE_STATUS: Partial<Record<ResultStatus, TestCaseStatus>> = { passed: 'passed', failed: 'failed', blocked: 'blocked' }

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
      caseStatus && tc && tc.status !== caseStatus && !caseSyncBlock(run, stamped, tc, list, projectOf(run.projectId))
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
