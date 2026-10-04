import type { AppModule } from '#core/module.js'
import { TeamModel } from './team.model.js'
import { teamRouter } from './team.routes.js'
import { teamSeed } from './team.seed.js'
import { teamService } from './team.service.js'

// Teams of people; a project lists the teams that may open it. Public API: who is in which team.
export const teams = {
  idsOfMember: teamService.idsOfMember,
  /** the members of a team (empty when there is no such team) */
  memberIds: teamService.memberIds,
}

export const teamModule: AppModule = {
  name: 'team',
  router: teamRouter,
  models: [TeamModel],
  seeds: [teamSeed],
}
