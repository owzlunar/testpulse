import type {
  PermissionKey,
  ResultStatus,
  RunResult,
  RunResultSaveResult,
  TestCaseImpact,
  TestCaseStatus,
  TestRun,
  TestRunInput,
} from '#contract/types.js'
import { caseSyncBlock, resultFor } from '#contract/rules/run.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import { assertCan } from '#core/auth/guards.js'
import { can, type Principal } from '#core/auth/principal.js'
import { ApiError } from '#core/http/errors.js'
import { projectAccess } from '#modules/project/index.js'
import { testCases } from '#modules/test-case/index.js'
import { runRepository } from './run.repository.js'

/** what planning may change on a run (results go through saveResult) */
export type RunFields = Partial<Pick<TestRun, 'name' | 'type' | 'round' | 'environment' | 'build' | 'status' | 'plannedStart' | 'plannedEnd'>>
/** what a tester records for a case; the snapshot (name, version, steps) and the stamp stay the server's */
export type ResultInput = Pick<RunResult, 'caseId' | 'status' | 'stepResults' | 'actualResults' | 'evidence' | 'defectIds' | 'notes'>

/** a run verdict that also becomes the case's current status */
const CASE_STATUS: Partial<Record<ResultStatus, TestCaseStatus>> = { passed: 'passed', failed: 'failed', blocked: 'blocked' }

async function found(id: string): Promise<TestRun> {
  const run = await runRepository.findById(id)
  if (!run) throw ApiError.notFound('ไม่พบรอบการทดสอบ')
  return run
}

async function guard(p: Principal, projectId: string, need: PermissionKey) {
  assertCan(p, need)
  await projectAccess.assert(p, projectId)
}

const runAudit = (run: TestRun, action: 'CREATE' | 'STATUS_CHANGE' | 'DELETE', details: string) =>
  recordAudit({ action, targetType: 'PROJECT', targetId: run.id, projectId: run.projectId, targetTitle: run.name, details })

export const runService = {
  /** GET /test-runs: of the projects the user may open, newest first */
  async list(p: Principal): Promise<TestRun[]> {
    if (!p.roleId || !can(p, 'run.view')) return []
    return runRepository.ofProjects([...(await projectAccess.accessibleIds(p))])
  },

  /** POST /projects/:projectId/test-runs: snapshots the chosen active cases as they are now */
  async create(p: Principal, projectId: string, input: Omit<TestRunInput, 'projectId'>): Promise<TestRun> {
    await guard(p, projectId, 'run.create')
    const cases = (await testCases.activeOfProject(projectId)).filter((c) => input.caseIds.includes(c.id))
    if (!cases.length) throw ApiError.unprocessable('เลือก Test Case อย่างน้อย 1 รายการ')
    const { caseIds: _ids, assignee, ...fields } = input
    const run = await runRepository.create({
      ...fields,
      projectId,
      status: 'planned',
      createdBy: p.name,
      results: cases.map((c) => resultFor(c, assignee)),
    })
    await runAudit(run, 'CREATE', `สร้างรอบทดสอบ ${run.name} รอบที่ ${run.round} (${run.results.length} เคส)`)
    return run
  },

  /** PATCH /test-runs/:id: planning (run.create); closing it is its own permission (run.close) */
  async update(p: Principal, id: string, fields: RunFields): Promise<TestRun> {
    const run = await found(id)
    const closing = fields.status === 'completed' && run.status !== 'completed'
    await guard(p, run.projectId, closing ? 'run.close' : 'run.create')
    const now = new Date().toISOString()
    const stamps: Partial<Pick<TestRun, 'startedAt' | 'completedAt'>> = {}
    if (closing) stamps.completedAt = now
    if (fields.status === 'in_progress' && !run.startedAt) stamps.startedAt = now
    const saved = (await runRepository.update(id, { ...fields, ...stamps }))!
    if (closing) await runAudit(saved, 'STATUS_CHANGE', `ปิดรอบทดสอบ ${saved.name} รอบที่ ${saved.round}`)
    return saved
  },

  /**
   * PUT /test-runs/:id/results/:caseId
   * Stamps who ran it; when caseSyncBlock allows (the latest result for the case's current spec),
   * the verdict also becomes the case status, with the same rules and announcements as an edit.
   */
  async saveResult(p: Principal, id: string, input: ResultInput): Promise<RunResultSaveResult> {
    const run = await found(id)
    await guard(p, run.projectId, 'run.execute')
    if (run.status === 'completed') throw ApiError.conflict('รอบนี้ปิดแล้ว แก้ไขผลไม่ได้')
    const current = run.results.find((r) => r.caseId === input.caseId && !r.caseDeleted)
    if (!current) throw ApiError.notFound(`${input.caseId} ไม่อยู่ในรอบนี้`)
    const stamped: RunResult = { ...current, ...input, executedBy: p.name, executedAt: new Date().toISOString() }
    const starting = run.status === 'planned' ? { status: 'in_progress' as const, startedAt: stamped.executedAt } : {}
    const saved = (await runRepository.setResult(id, stamped, starting))!

    const caseStatus = CASE_STATUS[stamped.status]
    const tc = await testCases.find(run.projectId, stamped.caseId)
    const allowed = caseStatus && tc && tc.status !== caseStatus && !caseSyncBlock(saved, stamped, tc, await runRepository.ofProject(run.projectId))
    const caseUpdate = allowed
      ? await testCases.patch(
          run.projectId,
          tc.id,
          {
            status: caseStatus,
            actualResults: stamped.actualResults || tc.actualResults,
            executedBy: stamped.executedBy,
            executedAt: stamped.executedAt,
          },
          p,
        )
      : null
    return { run: saved, caseUpdate }
  },

  /** DELETE /test-runs/:id */
  async remove(p: Principal, id: string): Promise<void> {
    const run = await found(id)
    await guard(p, run.projectId, 'run.create')
    await runRepository.remove(id)
    await runAudit(run, 'DELETE', `ลบรอบทดสอบ ${run.name} รอบที่ ${run.round}`)
  },

  /** the runs that archiving / deleting these cases touches */
  async impactOf(projectId: string, ids: string[]): Promise<Pick<TestCaseImpact, 'runs'>> {
    return { runs: (await runRepository.withCases(projectId, ids)).map((r) => ({ name: r.name, round: r.round, open: r.status !== 'completed' })) }
  },
}
