import type { ReportApi } from '@/api/contract'
import type { ProjectReport } from '@/types'
import { get, post } from './http'

const path = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

export const reportApi: ReportApi = {
  fetchProjectReport: (projectId) => get<ProjectReport>(`${path(projectId)}/report`),
  recordExport: async (projectId, format, filename) => {
    await post<null>(`${path(projectId)}/exports`, { format, filename })
  },
}
