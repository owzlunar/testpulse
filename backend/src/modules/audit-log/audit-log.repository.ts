import type { FilterQuery } from 'mongoose'
import type { AuditTrailEntry } from '#contract/types.js'
import { AuditLogModel, type AuditLogDoc } from './audit-log.model.js'

export const auditLogRepository = {
  create: (entry: Omit<AuditLogDoc, '_id' | 'timestamp'>) => new AuditLogModel(entry).save(),
  newest: async (filter: FilterQuery<AuditLogDoc>, limit: number): Promise<AuditTrailEntry[]> =>
    (await AuditLogModel.find(filter).sort({ timestamp: -1 }).limit(limit)).map((d) => d.toJSON() as unknown as AuditTrailEntry),
}
