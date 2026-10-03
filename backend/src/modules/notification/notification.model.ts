import mongoose, { Schema } from 'mongoose'
import type { NotificationAudience, NotificationItem } from '#contract/types.js'
import { config } from '#core/config/env.js'
import { stringId } from '#core/database/ids.js'

/** one notification, shared by its audience; who read or removed it is kept per person */
export interface NotificationDoc extends Pick<
  NotificationItem,
  'type' | 'title' | 'message' | 'severity' | 'projectId' | 'testCaseId' | 'to' | 'fromUserId'
> {
  _id: string
  timestamp: Date
  readBy: string[]
  hiddenFor: string[]
  dueInDays?: number
  dailyKey?: string
}

const audienceSchema = new Schema<NotificationAudience>(
  { userIds: { type: [String], default: undefined }, disciplines: { type: [String], default: undefined } },
  { _id: false },
)

const notificationSchema = new Schema<NotificationDoc>(
  {
    _id: stringId('notif'),
    timestamp: { type: Date, default: () => new Date(), immutable: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    severity: { type: String, required: true },
    projectId: { type: String },
    testCaseId: { type: String },
    // none: everyone who can open the project (or everyone, without a project)
    to: { type: audienceSchema, default: undefined },
    fromUserId: { type: String },
    dueInDays: { type: Number },
    dailyKey: { type: String },
    readBy: { type: [String], default: [] },
    hiddenFor: { type: [String], default: [] },
  },
  { collection: 'notifications', versionKey: false },
)

notificationSchema.index({ projectId: 1, timestamp: -1 })
notificationSchema.index({ 'to.userIds': 1, timestamp: -1 })
notificationSchema.index({ dailyKey: 1, timestamp: -1 }, { sparse: true })
notificationSchema.index({ timestamp: 1 }, { expireAfterSeconds: config.notifications.retentionDays * 24 * 60 * 60, name: 'retention' })

export const NotificationModel = mongoose.model<NotificationDoc>('Notification', notificationSchema)
