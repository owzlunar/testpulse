import type { NotificationItem, NotificationType, Option, Role, Tone, User } from '@/types'

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
