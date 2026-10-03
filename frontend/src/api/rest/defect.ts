import type { DefectApi } from '@/api/contract'
import type { Defect } from '@/types'
import { get, post, put } from './http'

// The reporter and a comment's author and time come from the session on the server.
export const defectApi: DefectApi = {
  fetchDefects: () => get<Defect[]>('/defects'),
  saveDefect: ({ id, projectId, caseDeleted: _d, ...fields }) =>
    id ? put<Defect>(`/defects/${encodeURIComponent(id)}`, fields) : post<Defect>(`/projects/${encodeURIComponent(projectId)}/defects`, fields),
  addDefectComment: (id, { text }) => post<Defect>(`/defects/${encodeURIComponent(id)}/comments`, { text }),
}
