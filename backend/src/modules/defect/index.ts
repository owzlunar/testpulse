import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { DefectCounterModel, DefectModel } from './defect.model.js'
import { defectRepository } from './defect.repository.js'
import { defectRouter } from './defect.routes.js'
import { defectSeed } from './defect.seed.js'
import { defectService } from './defect.service.js'

// Defects found while testing (BUG-nnn across every project): Dev fixes, QA re-tests, closes.
// They follow renumbered cases, keep a deleted case's id as history and count in a case's impact.
// Public API for other modules: a project's defects (documents print them).
export const defects = {
  ofProject: (projectId: string) => defectRepository.ofProjects([projectId]),
}

export const defectModule: AppModule = {
  name: 'defect',
  router: defectRouter,
  models: [DefectModel, DefectCounterModel],
  seeds: [defectSeed],
  setup() {
    on('test-case.renamed', ({ projectId, renames, session }) => defectRepository.renameCases(projectId, renames, session))
    on('test-case.deleted', ({ projectId, ids }) => defectRepository.detachCases(projectId, ids))
    on('test-case.impact', ({ projectId, ids }) => defectService.impactOf(projectId, ids))
    on('project.deleted', ({ projectId }) => defectRepository.deleteOfProject(projectId))
  },
}
