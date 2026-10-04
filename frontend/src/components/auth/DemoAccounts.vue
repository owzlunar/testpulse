<script setup lang="ts">
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/utils/demo-accounts'

// One-click demo accounts on the login page: development builds only (Login.vue imports this
// component only when import.meta.env.DEV, so a production build doesn't contain it)
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ signIn: [email: string, password: string] }>()
</script>

<template>
  <div class="text-overline text-muted mb-2">บัญชีทดสอบ (รหัสผ่าน {{ DEMO_PASSWORD }})</div>
  <div class="d-flex flex-column ga-2 mb-6">
    <v-card
      v-for="u in DEMO_ACCOUNTS"
      :key="u.email"
      variant="flat"
      border
      class="login__user"
      :disabled="disabled"
      @click="emit('signIn', u.email, DEMO_PASSWORD)"
    >
      <div class="d-flex align-center ga-3 pa-3">
        <v-avatar :color="u.tone" variant="tonal" size="36"><v-icon icon="tabler:user" size="18" /></v-avatar>
        <div class="flex-grow-1 overflow-hidden">
          <div class="text-subtitle-2 text-truncate">{{ u.name }}</div>
          <div class="text-caption text-muted text-truncate">{{ u.email }}</div>
        </div>
        <v-chip :color="u.tone" size="x-small" variant="tonal">{{ u.role }}</v-chip>
      </div>
    </v-card>
  </div>

  <div class="d-flex align-center ga-3 mb-6">
    <v-divider />
    <span class="text-caption text-muted text-no-wrap">หรือใช้อีเมล</span>
    <v-divider />
  </div>
</template>

<style scoped>
.login__user {
  transition: background-color 0.15s;
}

.login__user:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
