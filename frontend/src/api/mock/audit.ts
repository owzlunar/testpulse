import type { AuditTrailEntry } from '@/types'
import { respond } from './http'
import { accessibleProjectIds, sessionCan } from './project'
import { SEED_AUDIT_LOGS } from './seeds/audit-logs.seed'
import { STORAGE_KEYS, load, update } from './storage'

// --- API ------------------------------------------------------------------------
/**
 * server-side: point the project's case entries at the renumbered ids so each case keeps its own history.
 * Entries saved before audit logs carried a projectId can't be told apart across projects and stay as they are.
 */
export function renameAuditCases(projectId: string, renames: Record<string, string>) {
  update(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS, (logs) =>
    logs.forEach((l) => {
      if (l.targetType === 'TEST_CASE' && l.projectId === projectId && !l.targetDeleted) l.targetId = renames[l.targetId] ?? l.targetId
    }),
  )
}

/** server-side: entries of deleted cases stay in the trail but no longer belong to the (reusable) id */
export function detachAuditCases(projectId: string, caseIds: string[]) {
  update(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS, (logs) =>
    logs.forEach((l) => {
      if (l.targetType === 'TEST_CASE' && l.projectId === projectId && caseIds.includes(l.targetId)) l.targetDeleted = true
    }),
  )
}

/** GET /audit-logs */
export const fetchAuditLogs = () =>
  respond(() => {
    const logs = load(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS)
    if (sessionCan('audit.view')) return logs
    // others still see the history of the cases they can open (case history tab)
    const projects = accessibleProjectIds()
    return logs.filter((l) => l.targetType === 'TEST_CASE' && !!l.projectId && projects.has(l.projectId))
  })

/** POST /audit-logs (on the real backend the server writes these itself) */
export const createAuditLog = (entry: AuditTrailEntry) =>
  respond(() => {
    update(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS, (logs) => [entry, ...logs])
    return entry
  }, 50)
