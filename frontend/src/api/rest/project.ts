import type { ProjectApi } from '@/api/contract'
import type { Project } from '@/types'
import { del, get, post, put } from './http'

export const projectApi: ProjectApi = {
  fetchProjects: () => get<Project[]>('/projects'),
  createProject: (input) => post<Project>('/projects', input),
  updateProject: (id, input) => put<Project>(`/projects/${id}`, input),
  async deleteProject(id) {
    await del(`/projects/${id}`)
  },
}
