<script setup lang="ts">
import { storeToRefs } from 'pinia'
import UserAvatar from '@/components/users/UserAvatar.vue'
import { roleOf } from '@/services/user.service'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useAuthStore } from '@/stores/auth.store'
import { firstName } from '@/utils/format'

// Profile menu + mock account switcher (to try each role)
const auth = useAuthStore()
const { currentUser, users } = storeToRefs(auth)
const { run } = useAsyncAction()
</script>

<template>
  <v-menu location="bottom end">
    <template #activator="{ props }">
      <v-btn v-bind="props" variant="text" class="ml-1 px-2" aria-label="เมนูผู้ใช้">
        <UserAvatar :user="currentUser" size="32" />
        <span class="d-none d-md-flex flex-column align-start ml-2 text-start">
          <span class="text-subtitle-2">{{ firstName(currentUser.name) }}</span>
          <span class="text-caption text-muted">{{ roleOf(currentUser.role).label }}</span>
        </span>
        <v-icon icon="tabler:chevron-down" size="16" class="ml-1 d-none d-md-inline-flex" />
      </v-btn>
    </template>

    <v-card width="300">
      <div class="d-flex align-center ga-3 pa-5">
        <UserAvatar :user="currentUser" size="48" />
        <div class="overflow-hidden">
          <div class="text-subtitle-2 text-truncate">{{ currentUser.name }}</div>
          <div class="text-caption text-muted text-truncate">{{ currentUser.email }}</div>
          <v-chip :color="roleOf(currentUser.role).tone" size="x-small" variant="tonal" class="mt-1">
            {{ roleOf(currentUser.role).label }}
          </v-chip>
        </div>
      </div>
      <v-divider />
      <div class="text-overline text-muted px-5 pt-3">สลับบัญชีทดสอบ</div>
      <v-list class="px-2">
        <v-list-item
          v-for="u in users"
          :key="u.id"
          :active="u.id === currentUser.id"
          color="primary"
          @click="run(() => auth.loginAs(u))"
        >
          <template #prepend>
            <UserAvatar :user="u" size="28" class="mr-3" />
          </template>
          <v-list-item-title class="text-body-2">{{ u.name }}</v-list-item-title>
          <template #append>
            <v-chip :color="roleOf(u.role).tone" size="x-small" variant="tonal">{{ u.role }}</v-chip>
          </template>
        </v-list-item>
      </v-list>
      <v-divider />
      <v-list class="px-2">
        <v-list-item to="/settings" prepend-icon="tabler:settings" title="ตั้งค่า" />
      </v-list>
      <div class="px-4 pb-4">
        <v-btn block variant="outlined" color="primary" prepend-icon="tabler:logout" to="/login">ออกจากระบบ</v-btn>
      </div>
    </v-card>
  </v-menu>
</template>
