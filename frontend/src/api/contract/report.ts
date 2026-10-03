import type { ExportFormat, ProjectReport } from '@/types'

export interface ReportApi {
  /** GET /projects/:projectId/report */
  fetchProjectReport(projectId: string): Promise<ProjectReport>

  /** POST /projects/:projectId/exports  { format, filename } (the file is made in the browser; the server records it) */
  recordExport(projectId: string, format: ExportFormat, filename: string): Promise<void>
}
