<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { useLayoutStore } from '@/stores/layout.store'
import { useNotificationStore } from '@/stores/notification.store'
import { useProjectStore } from '@/stores/project.store'
import type { NotificationItem, NotificationType } from '@/types'
import { formatRelative } from '@/utils/date'
import { NOTIFICATION_TYPES, notificationTypeOf } from '@/domain/notification'

// Notification center (right overlay drawer)
const router = useRouter()
const layout = useLayoutStore()
const store = useNotificationStore()
const { notifications, unreadCount } = storeToRefs(store)
const projectStore = useProjectStore()

const tab = ref<NotificationType | 'ALL'>('ALL')
const tabs = computed(() => [
  { value: 'ALL' as const, label: 'ทั้งหมด', count: notifications.value.length },
  ...NOTIFICATION_TYPES.filter((t) => t.value !== 'SYSTEM').map((t) => ({
    value: t.value,
    label: t.label,
    count: notifications.value.filter((n) => n.type === t.value).length,
  })),
])

const items = computed(() => (tab.value === 'ALL' ? notifications.value : notifications.value.filter((n) => n.type === tab.value)))

function open(item: NotificationItem) {
  store.markAsRead(item.id)
  layout.notificationsOpen = false
  if (!item.testCaseId) return
  if (item.projectId) projectStore.select(item.projectId)
  router.push({ path: '/test-cases', query: { caseId: item.testCaseId } })
}
</script>

<template>
  <v-navigation-drawer v-model="layout.notificationsOpen" class="fox-aside" location="end" width="400" temporary>
    <div class="notif__head">
      <div class="d-flex align-center ga-2">
        <h2 class="text-h5">การแจ้งเตือน</h2>
        <v-chip v-if="unreadCount" color="error" size="x-small" variant="flat" class="fox-num">{{ unreadCount }} ใหม่</v-chip>
      </div>
      <div class="d-flex align-center">
        <v-btn v-if="unreadCount" variant="text" color="primary" size="small" @click="store.markAllAsRead()">อ่านทั้งหมด</v-btn>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="layout.notificationsOpen = false" />
      </div>
    </div>

    <v-tabs v-model="tab" density="compact" show-arrows class="px-2">
      <v-tab v-for="t in tabs" :key="t.value" :value="t.value">
        {{ t.label }}
        <span class="text-caption text-muted fox-num ml-1">{{ t.count }}</span>
      </v-tab>
    </v-tabs>
    <v-divider />

    <div class="notif__list">
      <div
        v-for="item in items"
        :key="item.id"
        class="notif__item"
        :class="{ 'notif__item--unread': !item.read }"
        role="button"
        tabindex="0"
        @click="open(item)"
        @keydown.enter="open(item)"
      >
        <v-avatar :color="item.severity" size="40">
          <v-icon :icon="notificationTypeOf(item.type).icon" size="20" />
        </v-avatar>
        <div class="flex-grow-1 overflow-hidden">
          <div class="d-flex align-start justify-space-between ga-2">
            <span class="text-subtitle-2">{{ item.title }}</span>
            <span class="text-caption text-muted text-no-wrap">{{ formatRelative(item.timestamp) }}</span>
          </div>
          <p class="text-body-2 text-muted fox-clamp-2 mb-1">{{ item.message }}</p>
          <div class="d-flex align-center justify-space-between">
            <v-chip v-if="item.testCaseId" size="x-small" color="primary" variant="tonal" class="fox-num">{{ item.testCaseId }}</v-chip>
            <v-spacer />
            <v-btn
              v-if="!item.read"
              icon="tabler:check"
              variant="text"
              size="x-small"
              color="primary"
              aria-label="ทำเครื่องหมายว่าอ่านแล้ว"
              @click.stop="store.markAsRead(item.id)"
            />
            <v-btn icon="tabler:trash" variant="text" size="x-small" aria-label="ลบการแจ้งเตือน" @click.stop="store.remove(item.id)" />
          </div>
        </div>
      </div>

      <FoxEmptyState v-if="!items.length" icon="tabler:bell-check" title="ไม่มีการแจ้งเตือน" text="ทุกอย่างเรียบร้อยในหมวดนี้" />
    </div>

    <template v-if="notifications.length" #append>
      <div class="pa-4">
        <v-btn block variant="outlined" color="error" prepend-icon="tabler:trash" @click="store.clearAll()">ล้างการแจ้งเตือนทั้งหมด</v-btn>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.notif__head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding-inline: 20px 12px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.notif__list {
  padding: 8px;
}

.notif__item {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: var(--fox-radius-control);
  cursor: pointer;
  transition: background-color 0.15s;
}

.notif__item:hover,
.notif__item:focus-visible {
  background: rgba(var(--v-theme-primary), 0.04);
  outline: none;
}

.notif__item--unread {
  background: rgba(var(--v-theme-primary), 0.06);
}
</style>
