import type { NotificationApi } from '@/api/contract'
import type { NotificationItem } from '@/types'
import { del, get, openStream, patch, post } from './http'

export const notificationApi: NotificationApi = {
  fetchNotifications: () => get<NotificationItem[]>('/notifications'),
  // the server keeps only what it allows (a confirmation to oneself) and makes the id and time
  createNotification: ({ type, title, message, severity, projectId, to }) =>
    post<NotificationItem>('/notifications', { type, title, message, severity, projectId, to }),
  markNotificationRead: (id) => patch<void>(`/notifications/${encodeURIComponent(id)}/read`),
  markAllNotificationsRead: () => post<void>('/notifications/read-all'),
  deleteNotification: (id) => del<void>(`/notifications/${encodeURIComponent(id)}`),
  clearNotifications: () => del<void>('/notifications'),
  watchNotifications: (watch) =>
    openStream('/notifications/stream', {
      open: watch.connected,
      event: (name, data) => {
        if (name === 'notification') watch.added(data as NotificationItem)
        else if (name === 'changed') watch.changed()
      },
    }),
}
