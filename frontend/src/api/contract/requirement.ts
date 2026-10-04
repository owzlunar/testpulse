import type { Requirement, RequirementChangeResult, RequirementInput } from '@/types'

export interface RequirementApi {
  /** GET /requirements (of the projects the signed-in user may open) */
  fetchRequirements(): Promise<Requirement[]>

  /** GET /requirements/search?q=:q&limit=:limit&offset=:offset (code, TOR clause, title or description, in the projects the user may open) */
  searchRequirements(q: string, limit?: number, offset?: number): Promise<{ requirements: Requirement[]; total: number }>

  /**
   * POST /projects/:projectId/requirements · PUT /requirements/:id
   * When the meaning of an existing requirement changes, the server flags its linked cases for review.
   */
  saveRequirement(input: RequirementInput): Promise<RequirementChangeResult>

  /** DELETE /requirements/:id (its linked cases are flagged for review: they lost what they test) */
  deleteRequirement(id: string): Promise<RequirementChangeResult>
}
