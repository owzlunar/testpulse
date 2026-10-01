import type { Defect, DefectComment, DefectInput, DefectSeverity, DefectStatus, Option } from '@/types'
import { ApiError, respond } from './http'
import { assertCan, inAccessibleProjects, sessionCan } from './project.service'
import { STORAGE_KEYS, load, save } from './storage.service'
import { SEED_DEFECTS } from './seeds/defects.seed'

export const SEVERITIES: Option<DefectSeverity>[] = [
  { value: 'critical', label: 'Critical', hint: 'ระบบใช้งานไม่ได้ / ข้อมูลเสียหาย', tone: 'error', icon: 'tabler:alert-octagon' },
  { value: 'major', label: 'Major', hint: 'ฟังก์ชันหลักผิดพลาด', tone: 'caution', icon: 'tabler:alert-triangle' },
  { value: 'minor', label: 'Minor', hint: 'มีทางเลี่ยง', tone: 'warning', icon: 'tabler:alert-circle' },
  { value: 'trivial', label: 'Trivial', hint: 'ความสวยงาม / ข้อความ', tone: 'secondary', icon: 'tabler:info-circle' },
]

// Dev fixes -> QA re-tests -> closed (or back to open)
export const DEFECT_STATUSES: Option<DefectStatus>[] = [
  { value: 'open', label: 'Open', hint: 'รอ Dev รับงาน', tone: 'error', icon: 'tabler:bug' },
  { value: 'in_progress', label: 'In Progress', hint: 'Dev กำลังแก้', tone: 'primary', icon: 'tabler:code' },
  { value: 'fixed', label: 'Fixed', hint: 'แก้แล้ว รอ Deploy', tone: 'info', icon: 'tabler:tool' },
  { value: 'retest', label: 'Retest', hint: 'รอ QA ทดสอบซ้ำ', tone: 'warning', icon: 'tabler:refresh' },
  { value: 'closed', label: 'Closed', hint: 'ยืนยันแล้ว', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'rejected', label: 'Rejected', hint: 'ไม่ใช่ Bug / ซ้ำ', tone: 'secondary', icon: 'tabler:circle-minus' },
]

export const severityOf = (v: DefectSeverity) => SEVERITIES.find((s) => s.value === v) ?? SEVERITIES[2]
export const defectStatusOf = (v: DefectStatus) => DEFECT_STATUSES.find((s) => s.value === v) ?? DEFECT_STATUSES[0]
/** still affects a release */
export const isOpenDefect = (d: Defect) => !['closed', 'rejected'].includes(d.status)

// --- API ------------------------------------------------------------------------
const defects = () => load(STORAGE_KEYS.defects, SEED_DEFECTS)

/** server-side: follow renumbered case ids (old id -> new id) in the project's defects */
export function renameDefectCases(projectId: string, renames: Record<string, string>) {
  const list = defects()
  list.forEach((d) => {
    if (d.projectId === projectId && d.caseId && !d.caseDeleted) d.caseId = renames[d.caseId] ?? d.caseId
  })
  save(STORAGE_KEYS.defects, list)
}

/** server-side: defects of deleted cases keep the id as history, detached from it */
export function detachDefectCases(projectId: string, caseIds: string[]) {
  const list = defects()
  list.forEach((d) => {
    if (d.projectId === projectId && d.caseId && caseIds.includes(d.caseId)) d.caseDeleted = true
  })
  save(STORAGE_KEYS.defects, list)
}

/** server-side: the stored defects of a project */
export const defectsOf = (projectId: string): Defect[] => defects().filter((d) => d.projectId === projectId)

/** GET /defects (of the projects the signed-in user may open) */
export const fetchDefects = () => respond(() => (sessionCan('defect.view') ? inAccessibleProjects(defects()) : []))

/** POST /projects/:projectId/defects · PUT /defects/:id */
export const saveDefect = (input: DefectInput, reportedBy: string) =>
  respond(() => {
    const list = defects()
    const now = new Date().toISOString()
    // closing / rejecting is a verdict (defect.resolve); reporting and progress updates are defect.report
    const before = input.id ? list.find((d) => d.id === input.id) : undefined
    const resolving = (input.status === 'closed' || input.status === 'rejected') && input.status !== before?.status
    assertCan(resolving ? 'defect.resolve' : 'defect.report', before?.projectId ?? input.projectId)
    if (input.id) {
      const i = list.findIndex((d) => d.id === input.id)
      if (i < 0) throw new ApiError('ไม่พบ Defect', 404)
      // picking another case re-attaches a defect whose case was deleted
      const caseDeleted = input.caseId === list[i].caseId ? list[i].caseDeleted : false
      list[i] = { ...list[i], ...input, id: input.id, caseDeleted, updatedAt: now }
      save(STORAGE_KEYS.defects, list)
      return list[i]
    }
    const next = list.reduce((m, d) => Math.max(m, Number(d.id.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1
    const created: Defect = { ...input, id: `BUG-${String(next).padStart(3, '0')}`, reportedBy, comments: [], createdAt: now, updatedAt: now }
    save(STORAGE_KEYS.defects, [created, ...list])
    return created
  })

/** POST /defects/:id/comments */
export const addDefectComment = (id: string, comment: DefectComment) =>
  respond(() => {
    const list = defects()
    const d = list.find((x) => x.id === id)
    if (!d) throw new ApiError('ไม่พบ Defect', 404)
    assertCan('defect.report', d.projectId)
    d.comments.push(comment)
    d.updatedAt = comment.at
    save(STORAGE_KEYS.defects, list)
    return d
  })
