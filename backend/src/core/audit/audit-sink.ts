import type { AuditAction, AuditChange, AuditTargetType } from '#contract/types.js'
import { logger } from '../config/logger.js'

// Core records what changed; where it goes is up to the audit-log module, which registers itself as
// the sink at start-up. Without it (an app built without that module) recording is a no-op.

export interface AuditEvent {
  action: AuditAction
  /** what was changed, e.g. 'PROJECT', 'USER' */
  targetType: AuditTargetType
  targetId: string
  targetTitle: string
  projectId?: string
  /** human-readable summary (Thai); the sink writes a default one when it is missing */
  details?: string
  changes?: AuditChange[]
}

export interface AuditSink {
  record(event: AuditEvent): Promise<void>
}

let sink: AuditSink | null = null

export function setAuditSink(next: AuditSink | null): void {
  sink = next
}

/** never fails the request: the change has already been saved when this runs */
export async function recordAudit(event: AuditEvent): Promise<void> {
  if (!sink) return
  try {
    await sink.record(event)
  } catch (err) {
    logger.error(`Audit entry not recorded (${event.action} ${event.targetType} ${event.targetId}): ${(err as Error).message}`)
  }
}
