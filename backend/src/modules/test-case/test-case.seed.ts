import type { TestCaseVersionRecord } from '#contract/types.js'
import { specOf } from '#contract/rules/test-case.js'
import type { Seed } from '#core/module.js'
import { TestCaseModel } from './test-case.model.js'
import { SEED_TEST_CASES } from './test-case.seed-data.js'

// Upserted by a fixed uid per demo case (list order = the order here): re-running resets them.
// The current version keeps its spec (as the web app's mock does), so it can be restored later.
export const testCaseSeed: Seed = {
  name: 'test-cases',
  async run() {
    for (const [position, { uid, rev, createdAt, updatedAt, versionHistory = [], ...tc }] of SEED_TEST_CASES.entries()) {
      const history: TestCaseVersionRecord[] = versionHistory.map((r) =>
        r.version === tc.version && !r.snapshot ? { ...r, snapshot: specOf(tc) } : r,
      )
      await TestCaseModel.findOneAndUpdate(
        { _id: uid ?? `tc-demo-${tc.projectId}-${tc.id.toLowerCase()}` },
        {
          $set: {
            ...tc,
            versionHistory: history,
            rev: rev ?? 1,
            position: position + 1,
            createdAt: new Date(createdAt),
            updatedAt: new Date(updatedAt),
          },
        },
        { upsert: true, timestamps: false },
      )
    }
  },
}
