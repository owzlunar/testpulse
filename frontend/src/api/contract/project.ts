import type { Project, ProjectInput } from '@/types'

export interface ProjectApi {
  /**
   * GET /projects (only the ones the signed-in user may open), each with the counts of its active cases:
   * the client loads cases one project at a time, so lists and totals come from here
   */
  fetchProjects(): Promise<Project[]>

  /** POST /projects (Admin only) */
  createProject(input: ProjectInput): Promise<Project>

  /** PUT /projects/:id (Admin only) */
  updateProject(id: string, input: ProjectInput): Promise<Project>

  /** DELETE /projects/:id (the server also removes the project's test cases) */
  deleteProject(id: string): Promise<void>
}
