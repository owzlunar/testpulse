import type { NotificationItem } from '@/types'

export interface NotificationApi {
  /** GET /notifications (the signed-in user's, read state per person) */
  fetchNotifications(): Promise<NotificationItem[]>

  /** POST /notifications (on the real backend the server creates these itself) */
  createNotification(item: NotificationItem): Promise<void>

  /** PATCH /notifications/:id/read (for the signed-in user only) */
  markNotificationRead(id: string): Promise<void>

  /** POST /notifications/read-all */
  markAllNotificationsRead(): Promise<void>

  /** DELETE /notifications/:id (removes it from the signed-in user's list; others keep it) */
  deleteNotification(id: string): Promise<void>

  /** DELETE /notifications (clears the signed-in user's list) */
  clearNotifications(): Promise<void>
}
