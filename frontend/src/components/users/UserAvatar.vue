<script setup lang="ts">
import type { User } from '@/types'
import { initials } from '@/utils/format'

// Photo avatar with initials while loading / when the image fails
withDefaults(defineProps<{ user: Pick<User, 'name' | 'avatar'>; size?: number | string }>(), { size: 36 })
</script>

<template>
  <v-avatar :size="size" color="primary">
    <v-img v-if="user.avatar" :src="user.avatar" :alt="user.name" cover>
      <template #error>
        <span class="d-flex align-center justify-center fill-height text-subtitle-2">{{ initials(user.name) }}</span>
      </template>
    </v-img>
    <span v-else class="text-subtitle-2">{{ initials(user.name) }}</span>
  </v-avatar>
</template>
