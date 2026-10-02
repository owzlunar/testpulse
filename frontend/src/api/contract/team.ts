import type { Project, Team, TeamInput } from '@/types'

export interface TeamApi {
  /** GET /teams */
  fetchTeams(): Promise<Team[]>

  /** POST /teams · PUT /teams/:id (Admin only); names are unique */
  saveTeam(input: TeamInput): Promise<Team>

  /**
   * DELETE /teams/:id (Admin only). The team is also removed from projects; a project left with
   * no team becomes open to everyone with a role. Returns the projects that changed.
   */
  deleteTeam(id: string): Promise<Project[]>
}
