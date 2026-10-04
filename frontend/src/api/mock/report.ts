import type { ExportFormat } from '@/types'
import { projectReport } from '@/domain/report'
import { defectsOf } from './defect'
import { respond } from './http'
import { ApiError } from '@/api/errors'
import { assertCan, storedProjects } from './project'
import { runsOf } from './run'
import { storedCases } from './test-case'

/** GET /projects/:projectId/report */
export const fetchProjectReport = (projectId: string) =>
  respond(() => {
    assertCan('report.view', projectId)
    const project = storedProjects().find((p) => p.id === projectId)
    if (!project) throw new ApiError('ไม่พบโปรเจกต์', 404)
    const cases = storedCases().filter((c) => c.projectId === projectId && !c.archivedAt)
    return projectReport(project, cases, runsOf(projectId), defectsOf(projectId))
  })

/** POST /projects/:projectId/exports (mock: the store's audit entry is already kept in the mock's log) */
export const recordExport = (projectId: string, _format: ExportFormat, _filename: string) =>
  respond(() => {
    assertCan('case.view', projectId)
  })
