import type { AuditAction, AuditTrailEntry } from '#contract/types.js'
import { can, type Principal } from '#core/auth/principal.js'
import type { AuditEvent, AuditSink } from '#core/audit/audit-sink.js'
import { requestContext } from '#core/http/context.js'
import { projectAccess } from '#modules/project/index.js'
import { auditLogRepository } from './audit-log.repository.js'

/** newest entries a list returns */
export const AUDIT_LIST_LIMIT = 2000

const ACTION_LABELS: Partial<Record<AuditAction, string>> = { CREATE: 'สร้าง', UPDATE: 'แก้ไข', DELETE: 'ลบ' }
const TARGET_LABELS: Record<string, string> = { PROJECT: 'โปรเจกต์', TEST_CASE: 'Test Case', USER: 'ผู้ใช้', ROLE: 'Role', TEAM: 'ทีม' }

/** "แก้ไขทีม "ทีม Payment" (name, memberIds)" when the change didn't come with its own wording */
function defaultDetails(event: AuditEvent): string {
  const what = `${ACTION_LABELS[event.action] ?? event.action} ${TARGET_LABELS[event.targetType] ?? event.targetType} "${event.targetTitle}"`
  return event.changes?.length ? `${what} (${event.changes.map((c) => c.field).join(', ')})` : what
}

/** writes entries for core's audit plugin and recordAudit(); the actor comes from the request */
export const auditSink: AuditSink = {
  async record(event) {
    const context = requestContext()
    const actor = context?.principal
    await auditLogRepository.create({
      ...event,
      details: event.details ?? defaultDetails(event),
      userId: actor?.id ?? 'system',
      userName: actor?.name ?? 'ระบบ',
      userRole: actor ? (actor.roleName ?? 'ไม่มี Role') : 'System',
      requestId: context?.requestId,
      ip: context?.ip,
    })
  },
}

export const auditLogService = {
  /**
   * With audit.view: every entry. Others still see the history of the test cases of projects
   * they may open (the case history tab). Newest first, at most AUDIT_LIST_LIMIT.
   */
  async list(principal: Principal): Promise<AuditTrailEntry[]> {
    if (!principal.roleId) return []
    const filter = can(principal, 'audit.view')
      ? {}
      : { targetType: 'TEST_CASE', projectId: { $in: [...(await projectAccess.accessibleIds(principal))] } }
    return auditLogRepository.newest(filter, AUDIT_LIST_LIMIT)
  },
}
