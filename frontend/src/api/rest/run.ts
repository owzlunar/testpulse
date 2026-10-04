import type { RunApi } from '@/api/contract'
import type { RunResultSaveResult, RunSearchHit, TestRun } from '@/types'
import { del, get, patch, post, put, searchQuery } from './http'

// The server snapshots the cases itself (`cases` is not sent) and stamps the tester from the session.
const runUrl = (id: string) => `/test-runs/${encodeURIComponent(id)}`

export const runApi: RunApi = {
  fetchRuns: () => get<TestRun[]>('/test-runs'),
  searchRuns: (q, limit = 20, offset = 0) => get<{ runs: RunSearchHit[]; total: number }>(`/test-runs/search${searchQuery(q, limit, offset)}`),
  createRun: ({ projectId, ...input }) => post<TestRun>(`/projects/${encodeURIComponent(projectId)}/test-runs`, input),
  updateRun: (id, { name, type, round, environment, build, status, plannedStart, plannedEnd }) =>
    patch<TestRun>(runUrl(id), { name, type, round, environment, build, status, plannedStart, plannedEnd }),
  saveResult: (runId, { caseId, status, stepResults, actualResults, evidence, defectIds, notes }) =>
    put<RunResultSaveResult>(`${runUrl(runId)}/results/${encodeURIComponent(caseId)}`, {
      status,
      stepResults,
      actualResults,
      evidence,
      defectIds,
      notes,
    }),
  deleteRun: (id) => del<void>(runUrl(id)),
}
