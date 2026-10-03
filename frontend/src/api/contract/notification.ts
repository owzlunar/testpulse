import type { NotificationItem } from '@/types'

/** what a notification stream reports */
export interface NotificationWatch {
  /** (re)connected: reload the list, events may have been missed meanwhile */
  connected(): void
  /** a new notification for the signed-in user */
  added(item: NotificationItem): void
  /** their read / removed state changed elsewhere (another tab): reload the list */
  changed(): void
}

export interface NotificationApi {
  /** GET /notifications (the signed-in user's, read state per person) */
  fetchNotifications(): Promise<NotificationItem[]>

  /**
   * POST /notifications: the backend takes only a SYSTEM confirmation to oneself (`to.userIds` = [me],
   * e.g. an export done in the browser) and creates every other notification itself, with the change.
   * Answers with the saved notification (the server's id).
   */
  createNotification(item: NotificationItem): Promise<NotificationItem>

  /** GET /notifications/stream (server-sent events), reconnecting by itself; returns stop */
  watchNotifications(watch: NotificationWatch): () => void

  /** PATCH /notifications/:id/read (for the signed-in user only) */
  markNotificationRead(id: string): Promise<void>

  /** POST /notifications/read-all */
  markAllNotificationsRead(): Promise<void>

  /** DELETE /notifications/:id (removes it from the signed-in user's list; others keep it) */
  deleteNotification(id: string): Promise<void>

  /** DELETE /notifications (clears the signed-in user's list) */
  clearNotifications(): Promise<void>
}
