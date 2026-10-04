import type { Defect, DefectComment, DefectInput } from '@/types'

export interface DefectApi {
  /** GET /defects (of the projects the signed-in user may open) */
  fetchDefects(): Promise<Defect[]>

  /** GET /defects/search?q=:q&limit=:limit&offset=:offset (id, title, external key or case, in the projects the user may open; newest first) */
  searchDefects(q: string, limit?: number, offset?: number): Promise<{ defects: Defect[]; total: number }>

  /** POST /projects/:projectId/defects · PUT /defects/:id */
  saveDefect(input: DefectInput, reportedBy: string): Promise<Defect>

  /** POST /defects/:id/comments */
  addDefectComment(id: string, comment: DefectComment): Promise<Defect>
}
