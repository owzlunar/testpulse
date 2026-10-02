import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { ProjectModel } from './project.model.js'
import { projectRouter } from './project.routes.js'
import { projectSeed } from './project.seed.js'
import { projectService } from './project.service.js'

// Projects and who may open them. Public API for other modules: project access checks (every module
// with project data filters and guards by it) and the case-count provider hook.
export { emptyStats, setCaseStatsProvider, type CaseStatsProvider } from './project.service.js'
export const projectAccess = {
  assert: projectService.assertAccess,
  accessibleIds: projectService.accessibleIds,
}

export const projectModule: AppModule = {
  name: 'project',
  router: projectRouter,
  models: [ProjectModel],
  seeds: [projectSeed],
  setup() {
    on('team.deleted', ({ teamId, session }) => projectService.dropTeam(teamId, session))
  },
}
