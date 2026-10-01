<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import type { VForm } from 'vuetify/components'
import AppLogo from '@/components/layout/AppLogo.vue'
import UserAvatar from '@/components/users/UserAvatar.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useAuthStore } from '@/stores/auth.store'
import type { User } from '@/types'
import * as v from '@/utils/validators'

const router = useRouter()
const auth = useAuthStore()
const { users } = storeToRefs(auth)
const { busy: signingIn, run } = useAsyncAction()
const loadingUsers = ref(true)
onMounted(() => run(() => auth.load()).finally(() => (loadingUsers.value = false)))

const formRef = ref<VForm>()
const form = reactive({ email: 'somchai.qa@testpulse.dev', password: 'password123' })
const showPw = ref(false)
const error = ref('')

function signIn(user: User) {
  run(() => auth.loginAs(user), () => router.push('/dashboard'))
}

async function submit() {
  error.value = ''
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  // demo: any password signs in as the user with that email
  const user = users.value.find((u) => u.email === form.email)
  if (user) signIn(user)
  else error.value = 'ไม่พบบัญชีที่ใช้อีเมลนี้ ลองเลือกบัญชีทดสอบด้านบน'
}

const year = new Date().getFullYear()

const highlights: { icon: string; text: string }[] = [
  { icon: 'tabler:arrows-exchange', text: 'ติดตามวงจร Dev ↔ QA และรอบแก้ซ้ำ (Defect Churn)' },
  { icon: 'tabler:clock-exclamation', text: 'แจ้งเตือน SLA เลยกำหนดตามผู้ที่ถือเคสอยู่' },
  { icon: 'tabler:certificate', text: 'ออกเอกสาร UAT Sign-off พร้อม Release Gatekeeper' },
]
</script>

<template>
  <div class="login">
    <!-- brand panel (tablet landscape and up) -->
    <aside class="login__brand bg-light-primary d-none d-md-flex">
      <AppLogo />
      <div class="login__pitch">
        <h1 class="text-h1 mb-3">บริหารการทดสอบ<br />ให้ทีมส่งมอบได้มั่นใจ</h1>
        <p class="text-subtitle-1 text-muted mb-8">แพลตฟอร์ม Test Case Management สำหรับ QA, Developer และ Project Manager</p>
        <ul class="login__list">
          <li v-for="h in highlights" :key="h.text" class="d-flex align-center ga-3">
            <v-avatar color="primary" variant="flat" size="40"><v-icon :icon="h.icon" size="20" /></v-avatar>
            <span class="text-body-1">{{ h.text }}</span>
          </li>
        </ul>
      </div>
      <div class="text-body-2 text-muted">© {{ year }} TestPulse</div>
    </aside>

    <!-- form -->
    <main class="login__main">
      <div class="login__form">
        <AppLogo class="d-md-none mb-8" />
        <h2 class="text-h2 mb-1">เข้าสู่ระบบ</h2>
        <p class="text-body-1 text-muted mb-6">เลือกบัญชีทดสอบเพื่อเข้าใช้งานทันที</p>

        <div v-if="loadingUsers" class="d-flex flex-column ga-2 mb-6">
          <v-skeleton-loader v-for="i in 4" :key="i" type="list-item-avatar-two-line" />
        </div>
        <div v-else class="d-flex flex-column ga-2 mb-6">
          <v-card v-for="u in users" :key="u.id" variant="flat" border class="login__user" @click="signIn(u)">
            <div class="d-flex align-center ga-3 pa-3">
              <UserAvatar :user="u" size="36" />
              <div class="flex-grow-1 overflow-hidden">
                <div class="text-subtitle-2 text-truncate">{{ u.name }}</div>
                <div class="text-caption text-muted text-truncate">{{ u.email }}</div>
              </div>
              <v-chip :color="auth.roleOf(u).tone" size="x-small" variant="tonal">{{ auth.roleOf(u).label }}</v-chip>
            </div>
          </v-card>
        </div>

        <div class="d-flex align-center ga-3 mb-6">
          <v-divider />
          <span class="text-caption text-muted text-no-wrap">หรือใช้อีเมล</span>
          <v-divider />
        </div>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" :text="error" />

        <v-form ref="formRef" @submit.prevent="submit">
          <div class="mb-5">
            <label class="fox-label" for="login-email">อีเมล</label>
            <v-text-field id="login-email" v-model="form.email" type="email" autocomplete="email" prepend-inner-icon="tabler:mail" :rules="[v.required, v.email]" />
          </div>
          <div class="mb-6">
            <label class="fox-label" for="login-pw">รหัสผ่าน</label>
            <v-text-field
              id="login-pw"
              v-model="form.password"
              :type="showPw ? 'text' : 'password'"
              autocomplete="current-password"
              prepend-inner-icon="tabler:lock"
              :append-inner-icon="showPw ? 'tabler:eye-off' : 'tabler:eye'"
              :rules="[v.required]"
              @click:append-inner="showPw = !showPw"
            />
          </div>
          <v-btn block color="primary" size="large" type="submit" :loading="signingIn">เข้าสู่ระบบ</v-btn>
        </v-form>

        <p class="text-body-1 text-center text-muted mt-8">
          ยังไม่มีบัญชี?
          <router-link to="/register" class="text-primary font-weight-medium text-decoration-none">สมัครสมาชิก</router-link>
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  min-height: 100vh;
  min-height: 100dvh;
}

@media (min-width: 960px) {
  .login {
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  }
}

.login__brand {
  flex-direction: column;
  justify-content: space-between;
  gap: 48px;
  padding: 40px 48px;
}

.login__pitch {
  max-width: 480px;
}

.login__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.login__main {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px var(--fox-gutter);
}

.login__form {
  width: 100%;
  max-width: 440px;
}

.login__user {
  transition: background-color 0.15s;
}

.login__user:hover {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
