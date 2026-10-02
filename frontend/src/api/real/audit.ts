import type { AuditApi } from '@/api/contract'
import type { AuditTrailEntry } from '@/types'
import { get } from './http'

export const auditApi: AuditApi = {
  fetchAuditLogs: () => get<AuditTrailEntry[]>('/audit-logs'),
  // the backend records its own entries with every change: nothing to send (the store still shows
  // this one until the next load)
  createAuditLog: async (entry) => entry,
}
