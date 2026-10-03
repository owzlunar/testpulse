import type { ClientSession, FilterQuery } from 'mongoose'
import type { AuditTrailEntry } from '#contract/types.js'
import { AuditLogModel, type AuditLogDoc } from './audit-log.model.js'

export const auditLogRepository = {
  create: (entry: Omit<AuditLogDoc, '_id' | 'timestamp'>) => new AuditLogModel(entry).save(),
  newest: async (filter: FilterQuery<AuditLogDoc>, limit: number): Promise<AuditTrailEntry[]> =>
    (await AuditLogModel.find(filter).sort({ timestamp: -1 }).limit(limit)).map((d) => d.toJSON() as unknown as AuditTrailEntry),
  /**
   * points a project's case entries at renumbered ids (old -> new). Ids are often swapped, so every
   * one moves to a marked value first, then the marks come off.
   */
  async renameCases(projectId: string, renames: Record<string, string>, session?: ClientSession): Promise<void> {
    const scope = { targetType: 'TEST_CASE', projectId, targetDeleted: { $ne: true } }
    await AuditLogModel.bulkWrite(
      Object.entries(renames).map(([from, to]) => ({
        updateMany: { filter: { ...scope, targetId: from }, update: { $set: { targetId: `~${to}` } } },
      })),
      { session },
    )
    await AuditLogModel.updateMany({ ...scope, targetId: /^~/ }, [{ $set: { targetId: { $substrCP: ['$targetId', 1, 200] } } }], { session })
  },
  /** entries of deleted cases stay, but no longer belong to the (reusable) id */
  detachCases: (projectId: string, ids: string[]) =>
    AuditLogModel.updateMany({ targetType: 'TEST_CASE', projectId, targetId: { $in: ids } }, { $set: { targetDeleted: true } }),
}
