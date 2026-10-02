import type { Defect, DefectComment, DefectInput } from '@/types'

export interface DefectApi {
  /** GET /defects (of the projects the signed-in user may open) */
  fetchDefects(): Promise<Defect[]>

  /** POST /projects/:projectId/defects · PUT /defects/:id */
  saveDefect(input: DefectInput, reportedBy: string): Promise<Defect>

  /** POST /defects/:id/comments */
  addDefectComment(id: string, comment: DefectComment): Promise<Defect>
}
