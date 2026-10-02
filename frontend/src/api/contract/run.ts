import type { Actor, RunResult, RunResultSaveResult, TestCase, TestRun, TestRunInput } from '@/types'

export interface RunApi {
  /** GET /test-runs (of the projects the signed-in user may open) */
  fetchRuns(): Promise<TestRun[]>

  /** POST /projects/:projectId/test-runs (the server snapshots the selected cases) */
  createRun(input: TestRunInput, cases: TestCase[], createdBy: string): Promise<TestRun>

  /** PATCH /test-runs/:id (status, dates …) */
  updateRun(id: string, patch: Partial<Omit<TestRun, 'results'>>): Promise<TestRun>

  /**
   * PUT /test-runs/:id/results/:caseId
   * Stamps who ran it; when caseSyncBlock allows, the verdict also becomes the case status
   * (same rules as a case update: see applyCasePatch).
   */
  saveResult(runId: string, result: RunResult, actor: Actor): Promise<RunResultSaveResult>

  /** DELETE /test-runs/:id */
  deleteRun(id: string): Promise<void>
}
