import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { RequirementModel } from './requirement.model.js'
import { requirementRouter } from './requirement.routes.js'
import { requirementSeed } from './requirement.seed.js'
import { requirementService } from './requirement.service.js'

// What a project must do (traceability). Public API for other modules: a project's requirements.
// A change to what one says is announced ('requirement.changed' / 'requirement.deleted') so the
// cases that test it get flagged for review.
export const requirements = {
  ofProject: requirementService.ofProject,
  idsMatching: requirementService.idsMatching,
}

export const requirementModule: AppModule = {
  name: 'requirement',
  router: requirementRouter,
  models: [RequirementModel],
  seeds: [requirementSeed],
  setup() {
    on('project.deleted', ({ projectId }) => requirementService.removeOfProject(projectId))
  },
}
