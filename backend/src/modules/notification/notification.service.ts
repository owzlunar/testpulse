import type { FilterQuery } from 'mongoose'
import type { AppSettings, NotificationItem, NotificationType } from '#contract/types.js'
import { can, resolvePrincipal, type Principal } from '#core/auth/principal.js'
import { logger } from '#core/config/logger.js'
import { eventStreams } from '#core/http/event-stream.js'
import { ApiError } from '#core/http/errors.js'
import { requestContext } from '#core/http/context.js'
import type { NotifyEvent, NotifySink } from '#core/notify/notify-sink.js'
import { projectAccess } from '#modules/project/index.js'
import { userSettings } from '#modules/settings/index.js'
import type { NotificationDoc } from './notification.model.js'
import { notificationRepository } from './notification.repository.js'

/** newest notifications a list returns */
export const NOTIFICATION_LIST_LIMIT = 200
/** the event stream topic */
export const STREAM_TOPIC = 'notifications'

/** each person's settings turn kinds of notifications off for themselves (SYSTEM always comes) */
const MUTED_BY: { setting: keyof AppSettings; type: NotificationType }[] = [
  { setting: 'alertOnModification', type: 'MODIFIED' },
  { setting: 'alertOnStatusChange', type: 'STATUS_CHANGED' },
  { setting: 'alertOnExpiry', type: 'EXPIRING' },
]

/**
 * The notifications a person gets, as a query (the same rule as the web app's notificationIsFor):
 * their role receives notifications; the project is one they may open (or there is none); it names
 * them, or it isn't theirs and goes to everyone or to their discipline; they haven't removed it;
 * its kind isn't one they turned off. null: nothing at all.
 */
async function visibleTo(p: Principal): Promise<FilterQuery<NotificationDoc> | null> {
  if (!p.roleId || !can(p, 'notification.receive')) return null
  const [projectIds, settings] = await Promise.all([projectAccess.accessibleIds(p), userSettings.get(p.id)])
  const muted = MUTED_BY.filter((m) => !settings[m.setting]).map((m) => m.type)
  const notMine = { fromUserId: { $ne: p.id } }
  const audience: FilterQuery<NotificationDoc>[] = [{ 'to.userIds': p.id }, { ...notMine, to: null }]
  if (p.discipline) audience.push({ ...notMine, 'to.disciplines': p.discipline })
  return {
    hiddenFor: { $ne: p.id },
    $and: [{ $or: [{ projectId: null }, { projectId: { $in: [...projectIds] } }] }, { $or: audience }],
    ...(muted.length ? { type: { $nin: muted } } : {}),
  }
}

/** the API shape for one person: their read state, not everyone's */
const toItem = (doc: NotificationDoc, userId: string): NotificationItem => ({
  id: doc._id,
  type: doc.type,
  title: doc.title,
  message: doc.message,
  severity: doc.severity,
  timestamp: doc.timestamp.toISOString(),
  read: doc.readBy.includes(userId),
  ...(doc.projectId ? { projectId: doc.projectId } : {}),
  ...(doc.testCaseId ? { testCaseId: doc.testCaseId } : {}),
  ...(doc.to ? { to: doc.to } : {}),
  ...(doc.fromUserId ? { fromUserId: doc.fromUserId } : {}),
})

/** a new notification goes out on the open streams of everyone it is for */
async function deliver(doc: NotificationDoc): Promise<void> {
  const principals = new Map<string, Promise<Principal | null>>()
  for (const stream of eventStreams(STREAM_TOPIC)) {
    if (!principals.has(stream.userId)) principals.set(stream.userId, resolvePrincipal(stream.userId))
    const p = await principals.get(stream.userId)!
    const filter = p && (await visibleTo(p))
    if (filter && (await notificationRepository.exists({ _id: doc._id, ...filter }))) stream.send('notification', toItem(doc, stream.userId))
  }
}

/** the person's read / removed state changed: their other tabs reload the list */
function announceChange(userId: string) {
  for (const stream of eventStreams(STREAM_TOPIC)) if (stream.userId === userId) stream.send('changed', {})
}

async function create(event: NotifyEvent, fromUserId: string | undefined): Promise<NotificationDoc> {
  const doc = await notificationRepository.create({ ...event, fromUserId })
  // delivered after the response: the change and its notification are saved, streams follow
  void deliver(doc).catch((err: Error) => logger.error(`Notification ${doc._id} not delivered: ${err.message}`))
  return doc
}

/** what other modules' notify() calls end up in; the sender is the signed-in user of the request */
export const notifySink: NotifySink = {
  async send(event) {
    await create(event, requestContext()?.principal?.id)
  },
}

/** the change applies to the given notifications of the person (only ones they get) */
async function markFor(p: Principal, ids: string[] | 'all', field: 'readBy' | 'hiddenFor') {
  const filter = await visibleTo(p)
  if (!filter) return
  const changed = await notificationRepository.mark(ids === 'all' ? filter : { ...filter, _id: { $in: ids } }, field, p.id)
  if (changed) announceChange(p.id)
}

export type OwnNotification = Pick<NotificationItem, 'title' | 'message' | 'severity' | 'projectId'>

export const notificationService = {
  /** GET /notifications: the person's, newest first */
  async list(p: Principal): Promise<NotificationItem[]> {
    const filter = await visibleTo(p)
    if (!filter) return []
    return (await notificationRepository.newest(filter, NOTIFICATION_LIST_LIMIT)).map((d) => toItem(d, p.id))
  },

  /**
   * POST /notifications: a confirmation to oneself about something done in the browser (e.g. an
   * export). Everything else the server sends itself, with the change.
   */
  async createOwn(p: Principal, input: OwnNotification): Promise<NotificationItem> {
    if (input.projectId) await projectAccess.assert(p, input.projectId)
    const doc = await create({ ...input, type: 'SYSTEM', to: { userIds: [p.id] } }, p.id)
    return toItem(doc, p.id)
  },

  markRead: (p: Principal, id: string) => markFor(p, [id], 'readBy'),
  markAllRead: (p: Principal) => markFor(p, 'all', 'readBy'),
  hide: (p: Principal, id: string) => markFor(p, [id], 'hiddenFor'),
  hideAll: (p: Principal) => markFor(p, 'all', 'hiddenFor'),

  /** a deleted project takes its notifications along */
  removeOfProject: async (projectId: string) => {
    await notificationRepository.deleteOfProject(projectId)
  },
}

/** 403 for the POST of a notification to anyone but oneself (the server sends those) */
export const assertOwnAudience = (p: Principal, to: { userIds?: string[] } | undefined) => {
  if (to?.userIds?.length !== 1 || to.userIds[0] !== p.id) throw ApiError.forbidden('แจ้งเตือนถึงผู้อื่นสร้างโดยระบบเท่านั้น')
}
