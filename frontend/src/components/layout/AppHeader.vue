<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useTheme } from 'vuetify'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { useNotificationStore } from '@/stores/notification.store'
import AppLogo from './AppLogo.vue'
import GlobalSearch from './GlobalSearch.vue'
import { apiOn } from '@/api'
import ProjectSwitcher from './ProjectSwitcher.vue'
import UserMenu from './UserMenu.vue'

defineEmits<{ 'toggle-nav': [] }>()

const theme = useTheme()
const layout = useLayoutStore()
const { unreadCount } = storeToRefs(useNotificationStore())

const toggleTheme = () => {
  theme.global.name.value = theme.global.current.value.dark ? 'light' : 'dark'
}
const auth = useAuthStore()
</script>

<template>
  <v-app-bar height="72">
    <div class="d-flex align-center w-100 px-2 px-sm-4 ga-1">
      <v-btn icon="tabler:menu-2" variant="text" aria-label="เปิด/ย่อเมนู" @click="$emit('toggle-nav')" />

      <!-- logo only shows here when the sidebar is hidden (tablet / phone) -->
      <AppLogo class="d-lg-none ml-1 mr-2" icon-only />

      <ProjectSwitcher v-if="auth.hasRole" class="ml-1" />

      <div class="app-header__search d-none d-md-block ml-3">
        <GlobalSearch v-if="auth.hasRole && apiOn['test-case']" />
      </div>

      <v-spacer />

      <v-btn icon variant="text" :aria-label="$vuetify.theme.current.dark ? 'โหมดสว่าง' : 'โหมดมืด'" @click="toggleTheme">
        <v-icon :icon="$vuetify.theme.current.dark ? 'tabler:sun' : 'tabler:moon'" />
      </v-btn>

      <v-btn
        v-if="apiOn.notification && auth.can('notification.receive')"
        icon
        variant="text"
        aria-label="การแจ้งเตือน"
        @click="layout.notificationsOpen = !layout.notificationsOpen"
      >
        <v-badge :model-value="unreadCount > 0" :content="unreadCount" color="error">
          <v-icon icon="tabler:bell" />
        </v-badge>
      </v-btn>

      <UserMenu />
    </div>
  </v-app-bar>
</template>

<style scoped>
.app-header__search {
  flex: 0 1 360px;
  min-width: 200px;
}
</style>
