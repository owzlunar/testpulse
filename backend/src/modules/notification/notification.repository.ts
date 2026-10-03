import type { FilterQuery } from 'mongoose'
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
}
