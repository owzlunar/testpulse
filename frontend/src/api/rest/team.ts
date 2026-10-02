import type { TeamApi } from '@/api/contract'
import type { Project, Team } from '@/types'
import { del, get, post, put } from './http'

export const teamApi: TeamApi = {
  fetchTeams: () => get<Team[]>('/teams'),
  saveTeam: ({ id, ...fields }) => (id ? put<Team>(`/teams/${id}`, fields) : post<Team>('/teams', fields)),
  deleteTeam: (id) => del<Project[]>(`/teams/${id}`),
}
