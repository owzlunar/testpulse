import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { NotificationItem } from '@/types'
import { useAuthStore } from './auth.store'
import { clientSendsNotifications, notificationApi as api } from '@/api'
import { notificationIsFor } from '@/domain/notification'
import { newId } from '@/utils/ids'

export type NotificationInput = Omit<NotificationItem, 'id' | 'timestamp' | 'read'>

// Updates are optimistic: the list changes at once and the request runs in the background. With the
// backend, new notifications arrive over its event stream (watch).
export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])
  let stopWatching: (() => void) | null = null

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)

  async function load() {
    notifications.value = await api.fetchNotifications()
  }

  /** a new one for me, from the stream or a save (each at most once) */
  function receive(item: NotificationItem) {
    if (!notifications.value.some((n) => n.id === item.id)) notifications.value.unshift(item)
  }

  /** follow the server's stream from now on (reloads on every (re)connect) */
  function watch() {
    stopWatching ??= api.watchNotifications({
      connected: () => void load().catch(() => {}),
      added: receive,
      changed: () => void load().catch(() => {}),
    })
  }

  function add(input: NotificationInput): NotificationItem {
    const auth = useAuthStore()
    const item: NotificationItem = { ...input, id: newId('notif'), timestamp: new Date().toISOString(), read: false, fromUserId: auth.currentUser.id }
    // the backend makes the others itself, with the change; it takes only a confirmation to oneself
    const own = item.type === 'SYSTEM' && item.to?.userIds?.length === 1 && item.to.userIds[0] === auth.currentUser.id
    if (!clientSendsNotifications && !own) return item
    // stored for its audience; shown here only if the signed-in user is part of it
    if (notificationIsFor(item, auth.currentUser, auth.currentRole)) notifications.value.unshift(item)
    api
      .createNotification(item)
      .then((saved) => {
        // the server's id replaces ours, in place (unless the stream brought it already)
        if (saved.id === item.id) return
        const i = notifications.value.findIndex((n) => n.id === item.id)
        if (i < 0) return
        if (notifications.value.some((n) => n.id === saved.id)) notifications.value.splice(i, 1)
        else notifications.value[i] = saved
      })
      .catch(() => {})
    return item
  }

  function markAsRead(id: string) {
    const item = notifications.value.find((n) => n.id === id)
    if (!item || item.read) return
    item.read = true
    api.markNotificationRead(id).catch(() => {})
  }

  function markAllAsRead() {
    notifications.value.forEach((n) => (n.read = true))
    api.markAllNotificationsRead().catch(() => {})
  }

  function remove(id: string) {
    notifications.value = notifications.value.filter((n) => n.id !== id)
    api.deleteNotification(id).catch(() => {})
  }

  function clearAll() {
    notifications.value = []
    api.clearNotifications().catch(() => {})
  }

  /** a reorder renumbered case ids (the server already re-keyed its copy) */
  function renameCases(projectId: string, renames: Record<string, string>) {
    notifications.value.forEach((n) => {
      if (n.projectId === projectId && n.testCaseId) n.testCaseId = renames[n.testCaseId] ?? n.testCaseId
    })
  }

  /** cases were deleted (the server already detached its copy) */
  function detachCases(projectId: string, caseIds: string[]) {
    notifications.value.forEach((n) => {
      if (n.projectId === projectId && n.testCaseId && caseIds.includes(n.testCaseId)) n.testCaseId = undefined
    })
  }

  return { notifications, unreadCount, load, watch, add, markAsRead, markAllAsRead, remove, clearAll, renameCases, detachCases }
})
