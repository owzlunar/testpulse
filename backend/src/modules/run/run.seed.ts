import type { ResultStatus, RunResult } from '#contract/types.js'
import { addDays, todayISO } from '#contract/rules/date.js'
import { resultFor } from '#contract/rules/run.js'
import type { Seed } from '#core/module.js'
import { testCases } from '#modules/test-case/index.js'
import { RunModel } from './run.model.js'

// Two rounds on the demo project, built from its seeded cases (the same as the web app's mock):
// a completed functional round and a regression round in progress. Upserted by id.
export const runSeed: Seed = {
  name: 'test-runs',
  async run() {
    const cases = await testCases.activeOfProject('proj-1')
    if (!cases.length) return
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
    const today = todayISO()
    const runs = [
      {
        _id: 'run-1',
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
        createdAt: new Date('2026-09-20T10:00:00Z'),
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
        _id: 'run-2',
        projectId: 'proj-1',
        name: 'Sprint 42 · Regression',
        type: 'regression',
        round: 2,
        environmentId: 'env-test',
        environment: 'TEST',
        build: 'v3.2.0-rc2',
        status: 'in_progress',
        plannedStart: addDays(today, -2),
        plannedEnd: addDays(today, 3),
        startedAt: `${addDays(today, -2)}T09:00:00Z`,
        createdBy: qa,
        createdAt: new Date(`${addDays(today, -3)}T10:00:00Z`),
        results: round1.map((r) => (r.caseId.startsWith('TC-101') ? exec(r, 'passed', qa, `${addDays(today, -1)}T10:30:00Z`) : r)),
      },
    ]
    for (const { _id, ...run } of runs) await RunModel.findOneAndUpdate({ _id }, { $set: run }, { upsert: true, timestamps: false })
  },
}
