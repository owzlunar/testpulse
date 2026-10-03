import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { setCaseStatsProvider } from '#modules/project/index.js'
import { dueDateJob } from './test-case.jobs.js'
import { TestCaseModel } from './test-case.model.js'
import { testCaseRouter } from './test-case.routes.js'
import { testCaseSeed } from './test-case.seed.js'
import { testCaseService } from './test-case.service.js'

// Test cases: versions, the Dev <-> QA lifecycle, archive, renumbering. Announces renumbered and
// deleted cases ('test-case.renamed' / 'test-case.deleted') so the modules that point at cases follow.
export { applyCasePatch, assertFresh } from './test-case.service.js'

export const testCaseModule: AppModule = {
  name: 'test-case',
  router: testCaseRouter,
  models: [TestCaseModel],
  seeds: [testCaseSeed],
  jobs: [dueDateJob],
  setup() {
    setCaseStatsProvider(testCaseService.statsOf)
    on('requirement.changed', ({ requirement, reason }) => testCaseService.flagForReview(requirement, reason))
    on('requirement.deleted', ({ requirement, reason }) => testCaseService.flagForReview(requirement, reason))
    on('project.deleted', ({ projectId }) => testCaseService.removeOfProject(projectId))
  },
}
