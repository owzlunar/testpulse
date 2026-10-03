import type { RequirementApi } from '@/api/contract'
import type { Requirement, RequirementChangeResult } from '@/types'
import { del, get, post, put } from './http'

const path = (id: string) => `/requirements/${encodeURIComponent(id)}`

export const requirementApi: RequirementApi = {
  fetchRequirements: () => get<Requirement[]>('/requirements'),
  searchRequirements: (q, limit = 20) =>
    get<{ requirements: Requirement[]; total: number }>(`/requirements/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  saveRequirement: ({ id, projectId, ...fields }) =>
    id
      ? put<RequirementChangeResult>(path(id), fields)
      : post<RequirementChangeResult>(`/projects/${encodeURIComponent(projectId)}/requirements`, fields),
  deleteRequirement: (id) => del<RequirementChangeResult>(path(id)),
}
