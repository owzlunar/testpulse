import type {
  Actor,
  CaseExpectation,
  TestCase,
  TestCaseImpact,
  TestCaseInput,
  TestCaseOrder,
  TestCaseReorderResult,
  TestCaseReviewFlag,
  TestCaseUpdateResult,
} from '@/types'

export interface TestCaseApi {
  /** GET /projects/:projectId/test-cases (archived included; the client loads one project at a time) */
  fetchTestCases(projectId: string): Promise<TestCase[]>

  /** GET /test-cases?search=:q (active cases of every project the user may open; id, name, requirement, scenario) */
  searchTestCases(q: string, limit?: number): Promise<{ cases: TestCase[]; total: number }>

  /**
   * POST /projects/:projectId/test-cases (accepts several for import / AI drafts)
   * The server builds the case (v1.0, first history entry, timestamps) and assigns the next
   * TC number to inputs without an id; a given id must be free in the project.
   */
  createTestCases(projectId: string, inputs: TestCaseInput[], actor: Actor): Promise<TestCase[]>

  /** PATCH /projects/:projectId/test-cases/:id (the server versions the case: see applyCasePatch; `expected`: see assertFresh) */
  updateTestCase(
    projectId: string,
    id: string,
    patch: Partial<TestCaseInput>,
    actor: Actor,
    expected?: CaseExpectation,
  ): Promise<TestCaseUpdateResult>

  /**
   * POST /projects/:projectId/test-cases/:id/versions/:version/restore
   * Brings back the spec of an earlier version as a new version (same rules as an edit:
   * a passed case must be tested again). Images stay as they are (they are not kept in history).
   */
  restoreVersion(projectId: string, id: string, version: string, actor: Actor, expected?: CaseExpectation): Promise<TestCaseUpdateResult>

  /** POST /projects/:projectId/test-cases/:id/review (reviewed against the changed requirement: nothing to change) */
  markReviewed(projectId: string, id: string, actor: Actor, expected?: CaseExpectation): Promise<{ testCase: TestCase; cleared: TestCaseReviewFlag }>

  /** PATCH /projects/:projectId/test-cases/:id/due-date (reason required; a due date is not part of the spec: no new version) */
  extendDueDate(
    projectId: string,
    id: string,
    newDate: string,
    reason: string,
    actor: Actor,
    expected?: CaseExpectation,
  ): Promise<{ testCase: TestCase; oldDate: string }>

  /**
   * POST /projects/:projectId/test-cases/:id/archive (with its sub-cases)
   * The default way to remove a case: it keeps its id (never reused while archived) and every
   * run result, defect and audit entry stays attached, so it can be restored.
   */
  archiveTestCase(projectId: string, id: string, actor: Actor, expected?: CaseExpectation): Promise<TestCase[]>

  /** POST /projects/:projectId/test-cases/:id/restore (with the sub-cases archived together with it) */
  restoreTestCase(projectId: string, id: string, expected?: CaseExpectation): Promise<TestCase[]>

  /** GET /projects/:projectId/test-cases/:id/impact (what archiving or deleting it, with its sub-cases, touches) */
  caseImpact(projectId: string, id: string): Promise<TestCaseImpact>

  /**
   * DELETE /projects/:projectId/test-cases/:id (and its sub-cases): permanent, archived cases only.
   * Ids are reused later (new cases, renumbering), so everything that pointed at the deleted
   * cases is detached: run results and defects keep the old id as history only, alerts lose the link.
   * Returns the deleted ids.
   */
  deleteTestCase(projectId: string, id: string, expected?: CaseExpectation): Promise<string[]>

  /**
   * PUT /projects/:projectId/test-cases/order (the active cases, as shown in the list)
   * Renumbers ids in the given order (TC-101, TC-102 … and TC-101-1, TC-101-2 …), archived cases
   * after the active ones (archived sub-cases after their parent's active ones), and
   * re-keys every record that points at a case (run results, defects, notifications,
   * audit entries), so they keep pointing at the same case after its id changes.
   */
  reorderTestCases(projectId: string, order: TestCaseOrder[], uids?: Record<string, string>): Promise<TestCaseReorderResult>
}
