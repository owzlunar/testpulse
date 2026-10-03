import type { TestCaseApi } from '@/api/contract'
import type { TestCase, TestCaseReorderResult, TestCaseReviewFlag, TestCaseUpdateResult } from '@/types'
import { get, patch, post, put, request } from './http'

// The signed-in user making a change is the session's: the `actor` arguments are not sent.
const casesOf = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/test-cases`
const caseUrl = (projectId: string, id: string) => `${casesOf(projectId)}/${encodeURIComponent(id)}`

export const testCaseApi: TestCaseApi = {
  fetchTestCases: (projectId) => get<TestCase[]>(casesOf(projectId)),
  searchTestCases: (q, limit = 20) => get<{ cases: TestCase[]; total: number }>(`/test-cases?search=${encodeURIComponent(q)}&limit=${limit}`),
  createTestCases: (projectId, inputs) =>
    post<TestCase[]>(casesOf(projectId), {
      // the server owns these: a new case (also a clone or an import) starts fresh at v1.0
      cases: inputs.map(
        ({
          projectId: _p,
          version: _v,
          versionHistory: _h,
          archivedAt: _a,
          archivedBy: _b,
          reviewNeeded: _r,
          churnCount: _c,
          uid: _u,
          rev: _rev,
          activeUser: _au,
          changeSummary: _cs,
          bumpMajor: _bm,
          ...data
        }) => data,
      ),
    }),
  updateTestCase: (projectId, id, changes, _actor, expected) => patch<TestCaseUpdateResult>(caseUrl(projectId, id), { patch: changes, expected }),
  restoreVersion: (projectId, id, version, _actor, expected) =>
    post<TestCaseUpdateResult>(`${caseUrl(projectId, id)}/versions/${encodeURIComponent(version)}/restore`, { expected }),
  markReviewed: (projectId, id, _actor, expected) =>
    post<{ testCase: TestCase; cleared: TestCaseReviewFlag }>(`${caseUrl(projectId, id)}/review`, { expected }),
  extendDueDate: (projectId, id, newDate, reason, _actor, expected) =>
    patch<{ testCase: TestCase; oldDate: string }>(`${caseUrl(projectId, id)}/due-date`, { newDate, reason, expected }),
  archiveTestCase: (projectId, id, _actor, expected) => post<TestCase[]>(`${caseUrl(projectId, id)}/archive`, { expected }),
  restoreTestCase: (projectId, id, expected) => post<TestCase[]>(`${caseUrl(projectId, id)}/restore`, { expected }),
  caseImpact: (projectId, id) => get(`${caseUrl(projectId, id)}/impact`),
  deleteTestCase: (projectId, id, expected) => request<string[]>('DELETE', caseUrl(projectId, id), { body: { expected } }),
  reorderTestCases: (projectId, order, uids) => put<TestCaseReorderResult>(`${casesOf(projectId)}/order`, { order, uids }),
}
