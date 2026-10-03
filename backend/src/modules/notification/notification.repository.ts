import type { ClientSession, FilterQuery } from 'mongoose'
import { NotificationModel, type NotificationDoc } from './notification.model.js'

export const notificationRepository = {
  create: async (doc: Omit<NotificationDoc, '_id' | 'timestamp' | 'readBy' | 'hiddenFor'>): Promise<NotificationDoc> =>
    (await new NotificationModel(doc).save()).toObject(),
  newest: (filter: FilterQuery<NotificationDoc>, limit: number): Promise<NotificationDoc[]> =>
    NotificationModel.find(filter).sort({ timestamp: -1 }).limit(limit).lean<NotificationDoc[]>(),
  exists: async (filter: FilterQuery<NotificationDoc>) => !!(await NotificationModel.exists(filter)),
  /** add the user to `readBy` / `hiddenFor` of the matching notifications; how many changed */
  mark: async (filter: FilterQuery<NotificationDoc>, field: 'readBy' | 'hiddenFor', userId: string) =>
    (await NotificationModel.updateMany({ ...filter, [field]: { $ne: userId } }, { $addToSet: { [field]: userId } })).modifiedCount,
  deleteOfProject: (projectId: string) => NotificationModel.deleteMany({ projectId }),
  /** follows renumbered case ids (old -> new), through a marked value since ids are often swapped */
  async renameCases(projectId: string, renames: Record<string, string>, session?: ClientSession): Promise<void> {
    await NotificationModel.bulkWrite(
      Object.entries(renames).map(([from, to]) => ({
        updateMany: { filter: { projectId, testCaseId: from }, update: { $set: { testCaseId: `~${to}` } } },
      })),
      { session },
    )
    await NotificationModel.updateMany({ projectId, testCaseId: /^~/ }, [{ $set: { testCaseId: { $substrCP: ['$testCaseId', 1, 200] } } }], {
      session,
    })
  },
  /** alerts about deleted cases lose their link (the id may be reused) */
  detachCases: (projectId: string, ids: string[]) =>
    NotificationModel.updateMany({ projectId, testCaseId: { $in: ids } }, { $unset: { testCaseId: 1 } }),
}
