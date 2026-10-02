import type { AuditTrailEntry } from '@/types'

export interface AuditApi {
  /** GET /audit-logs */
  fetchAuditLogs(): Promise<AuditTrailEntry[]>

  /** POST /audit-logs (on the real backend the server writes these itself) */
  createAuditLog(entry: AuditTrailEntry): Promise<AuditTrailEntry>
}
