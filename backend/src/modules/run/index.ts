import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { RunModel } from './run.model.js'
import { runRepository } from './run.repository.js'
import { runRouter } from './run.routes.js'
import { runSeed } from './run.seed.js'
import { runService } from './run.service.js'

// Test runs: rounds of execution over snapshots of cases. A verdict becomes the case status when it
// is the latest result for the case's current spec (caseSyncBlock). Results follow renumbered cases
// and keep deleted ones as history. Public API for other modules: a run (documents print one), a
// project's runs (reports).
export const runs = {
  find: (id: string) => runRepository.findById(id),
  ofProject: (projectId: string) => runRepository.ofProject(projectId),
}

export const runModule: AppModule = {
  name: 'run',
  router: runRouter,
  models: [RunModel],
  seeds: [runSeed],
  setup() {
    on('test-case.renamed', ({ projectId, renames, session }) => runRepository.renameCases(projectId, renames, session))
    on('test-case.deleted', ({ projectId, ids }) => runRepository.detachCases(projectId, ids))
    on('test-case.impact', ({ projectId, ids }) => runService.impactOf(projectId, ids))
    on('project.deleted', ({ projectId }) => runRepository.deleteOfProject(projectId))
  },
}
