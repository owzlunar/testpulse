import type { NotificationItem, NotificationType, Option, Role, Tone, User } from '@/types'
import { respond } from './http'
import { inAccessibleProjects } from './project.service'
import { roleById } from './role.service'
import { sessionUser } from './user.service'
import { STORAGE_KEYS, load, update } from './storage.service'
import { SEED_NOTIFICATIONS } from './seeds/notifications.seed'

export const NOTIFICATION_TYPES: Option<NotificationType>[] = [
  { value: 'EXPIRING', label: 'ใกล้ครบกำหนด', tone: 'warning', icon: 'tabler:clock-exclamation' },
  { value: 'STATUS_CHANGED', label: 'เปลี่ยนสถานะ', tone: 'info', icon: 'tabler:arrows-exchange' },
  { value: 'MODIFIED', label: 'แก้ไข / เพิ่ม', tone: 'primary', icon: 'tabler:pencil' },
  { value: 'SYSTEM', label: 'ระบบ', tone: 'secondary', icon: 'tabler:info-circle' },
]

export const notificationTypeOf = (type: NotificationType): Option<NotificationType> =>
  NOTIFICATION_TYPES.find((t) => t.value === type) ?? NOTIFICATION_TYPES[3]

/** severity -> theme tone */
export const severityTone = (severity: NotificationItem['severity']): Tone => severity

// --- API ------------------------------------------------------------------------
const write = (fn: (items: NotificationItem[]) => NotificationItem[] | void) => update(STORAGE_KEYS.notifications, SEED_NOTIFICATIONS, fn)

/** server-side: follow renumbered case ids (old id -> new id) in the project's notifications */
export function renameNotificationCases(projectId: string, renames: Record<string, string>) {
  write((items) =>
    items.forEach((n) => {
      if (n.projectId === projectId && n.testCaseId) n.testCaseId = renames[n.testCaseId] ?? n.testCaseId
    }),
  )
}

/** server-side: alerts about deleted cases lose their link (the id may be reused) */
export function detachNotificationCases(projectId: string, caseIds: string[]) {
  write((items) =>
    items.forEach((n) => {
      if (n.projectId === projectId && n.testCaseId && caseIds.includes(n.testCaseId)) n.testCaseId = undefined
    }),
  )
}

/**
 * Is this notification for the user? Their role must receive notifications; it is for everyone
 * (who can open the project) without an audience, otherwise for the people / disciplines named.
 * The sender does not get their own broadcast. Shared by the server (lists) and the client (live add).
 */
export function notificationIsFor(n: NotificationItem, user: User | null, role: Role | null): boolean {
  if (!user || !role) return false
  if (role.builtIn !== 'admin' && !role.permissions.includes('notification.receive')) return false
  if (n.hiddenFor?.includes(user.id)) return false
  if (n.to?.userIds?.includes(user.id)) return true
  if (n.fromUserId === user.id) return false
  if (!n.to) return true
  return !!n.to.disciplines?.includes(role.discipline)
}

/** server-side: the notifications of the signed-in user, with `read` worked out for them */
function mine(): NotificationItem[] {
  const user = sessionUser()
  const role = roleById(user?.roleId)
  return inAccessibleProjects(load(STORAGE_KEYS.notifications, SEED_NOTIFICATIONS))
    .filter((n) => notificationIsFor(n, user, role))
    .map((n) => ({ ...n, read: !!user && !!n.readBy?.includes(user.id) }))
}

/** server-side: change the given notifications for the signed-in user only */
function forMe(ids: string[] | 'all', change: (n: NotificationItem, userId: string) => void) {
  const user = sessionUser()
  if (!user) return
  const visible = new Set(mine().map((n) => n.id))
  write((items) => items.forEach((n) => visible.has(n.id) && (ids === 'all' || ids.includes(n.id)) && change(n, user.id)))
}

const addTo = (list: string[] | undefined, userId: string) => [...new Set([...(list ?? []), userId])]

/** GET /notifications (the signed-in user's, read state per person) */
export const fetchNotifications = () => respond(mine)

/** POST /notifications (on the real backend the server creates these itself) */
export const createNotification = (item: NotificationItem) =>
  respond(() => void write((items) => [{ ...item, read: false, readBy: [], hiddenFor: [] }, ...items]), 50)

/** PATCH /notifications/:id/read (for the signed-in user only) */
export const markNotificationRead = (id: string) => respond(() => forMe([id], (n, me) => (n.readBy = addTo(n.readBy, me))), 100)

/** POST /notifications/read-all */
export const markAllNotificationsRead = () => respond(() => forMe('all', (n, me) => (n.readBy = addTo(n.readBy, me))))

/** DELETE /notifications/:id (removes it from the signed-in user's list; others keep it) */
export const deleteNotification = (id: string) => respond(() => forMe([id], (n, me) => (n.hiddenFor = addTo(n.hiddenFor, me))), 100)

/** DELETE /notifications (clears the signed-in user's list) */
export const clearNotifications = () => respond(() => forMe('all', (n, me) => (n.hiddenFor = addTo(n.hiddenFor, me))))
