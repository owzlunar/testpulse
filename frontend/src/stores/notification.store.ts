import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { NotificationItem } from '@/types'
import { newId } from '@/services/http'
import * as api from '@/services/notification.service'
import { notificationIsFor } from '@/services/notification.service'
import { useAuthStore } from './auth.store'

export type NotificationInput = Omit<NotificationItem, 'id' | 'timestamp' | 'read'>

// Updates are optimistic: the list changes at once and the request runs in the background
export const useNotificationStore = defineStore('notification', () => {
  const notifications = ref<NotificationItem[]>([])

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)

  async function load() {
    notifications.value = await api.fetchNotifications()
  }

  function add(input: NotificationInput): NotificationItem {
    const auth = useAuthStore()
    const item: NotificationItem = { ...input, id: newId('notif'), timestamp: new Date().toISOString(), read: false, fromUserId: auth.currentUser.id }
    // stored for its audience; shown here only if the signed-in user is part of it
    if (notificationIsFor(item, auth.currentUser, auth.currentRole)) notifications.value.unshift(item)
    api.createNotification(item).catch(() => {})
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

  return { notifications, unreadCount, load, add, markAsRead, markAllAsRead, remove, clearAll, renameCases, detachCases }
})
