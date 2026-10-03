import type { ExportFormat, ProjectReport } from '#contract/types.js'
import { projectReport } from '#contract/rules/report.js'
import { recordAudit } from '#core/audit/audit-sink.js'
import { assertCan } from '#core/auth/guards.js'
import type { Principal } from '#core/auth/principal.js'
import { defects } from '#modules/defect/index.js'
import { projectAccess } from '#modules/project/index.js'
import { runs } from '#modules/run/index.js'
import { testCases } from '#modules/test-case/index.js'

const FORMAT_LABELS: Record<ExportFormat, string> = { markdown: 'Obsidian Markdown (.md)' }

export const reportService = {
  /** GET /projects/:projectId/report: from the active cases, the runs and the defects */
  async ofProject(p: Principal, projectId: string): Promise<ProjectReport> {
    assertCan(p, 'report.view')
    await projectAccess.assert(p, projectId)
    const [cases, runList, defectList] = await Promise.all([
      testCases.activeOfProject(projectId),
      runs.ofProject(projectId),
      defects.ofProject(projectId),
    ])
    return projectReport(projectId, cases, runList, defectList)
  },

  /** POST /projects/:projectId/exports: the browser makes the file from the cases it may read; the server records it */
  async recordExport(p: Principal, projectId: string, format: ExportFormat, filename: string): Promise<void> {
    assertCan(p, 'case.view')
    const project = await projectAccess.assert(p, projectId)
    await recordAudit({
      action: 'EXPORT',
      targetType: 'PROJECT',
      targetId: project.id,
      targetTitle: project.name,
      projectId,
      details: `ส่งออก Test Case ของ ${project.name} เป็น ${FORMAT_LABELS[format]} (${filename})`,
    })
  },
}
