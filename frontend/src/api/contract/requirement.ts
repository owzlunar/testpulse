import type { Requirement, RequirementChangeResult, RequirementImportResult, RequirementImportRow, RequirementInput } from '@/types'

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

  /**
   * POST /projects/:projectId/requirements/import  { requirements, updateExisting }
   * Rows without a code get the next free one; a code that exists is skipped, or updated when
   * `updateExisting` (then a change to what it says flags its cases, as an edit does).
   */
  importRequirements(projectId: string, rows: RequirementImportRow[], updateExisting: boolean): Promise<RequirementImportResult>

  /** DELETE /requirements/:id (its linked cases are flagged for review: they lost what they test) */
  deleteRequirement(id: string): Promise<RequirementChangeResult>
}
