<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { VForm } from 'vuetify/components'
import AppLogo from '@/components/layout/AppLogo.vue'
import { authApi } from '@/api'
import { errorMessage } from '@/api/errors'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useAuthStore } from '@/stores/auth.store'
import type { InviteInfo } from '@/types'
import { formatDateTime } from '@/utils/date'
import * as v from '@/utils/validators'

// An invited user sets their password from the emailed link (/invite/:token), then is signed in
const route = useRoute()
const auth = useAuthStore()
const token = String(route.params.token ?? '')

const invite = ref<InviteInfo | null>(null)
const loadError = ref('')
const error = ref('')
const { busy, run } = useAsyncAction({ onError: (e) => (error.value = errorMessage(e)) })

const formRef = ref<VForm>()
const form = reactive({ password: '', confirm: '' })
const show = ref(false)
const sameAsPassword = (value: unknown) => value === form.password || 'รหัสผ่านไม่ตรงกัน'

onMounted(async () => {
  try {
    invite.value = await authApi.fetchInvite(token)
  } catch (e) {
    loadError.value = errorMessage(e)
  }
})

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  error.value = ''
  run(() => auth.acceptInvite(token, form.password))
}
</script>

<template>
  <main class="invite bg-background">
    <v-card class="invite__card fox-card-body">
      <AppLogo class="mb-8" />
      <template v-if="invite">
        <h1 class="text-h2 mb-1">ตั้งรหัสผ่าน</h1>
        <p class="text-body-1 text-muted mb-1">สวัสดีคุณ {{ invite.name }} ({{ invite.email }})</p>
        <p class="text-caption text-muted mb-6">ลิงก์นี้ใช้ได้ครั้งเดียว หมดอายุ {{ formatDateTime(invite.expiresAt) }}</p>

        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4" :text="error" />
        <v-form ref="formRef" @submit.prevent="submit">
          <label class="fox-label" for="invite-pw">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)</label>
          <v-text-field
            id="invite-pw"
            v-model="form.password"
            :type="show ? 'text' : 'password'"
            autocomplete="new-password"
            prepend-inner-icon="tabler:lock"
            :append-inner-icon="show ? 'tabler:eye-off' : 'tabler:eye'"
            :rules="[v.required, v.minLength(8)]"
            @click:append-inner="show = !show"
          />
          <label class="fox-label mt-4" for="invite-confirm">ยืนยันรหัสผ่าน</label>
          <v-text-field
            id="invite-confirm"
            v-model="form.confirm"
            :type="show ? 'text' : 'password'"
            autocomplete="new-password"
            prepend-inner-icon="tabler:lock-check"
            :rules="[v.required, sameAsPassword]"
          />
          <v-btn block color="primary" size="large" type="submit" class="mt-6" :loading="busy">ตั้งรหัสผ่านและเข้าสู่ระบบ</v-btn>
        </v-form>
      </template>
      <template v-else-if="loadError">
        <h1 class="text-h3 mb-2">ใช้ลิงก์นี้ไม่ได้</h1>
        <p class="text-body-1 text-muted mb-6">{{ loadError }}</p>
        <v-btn color="primary" to="/login">ไปหน้าเข้าสู่ระบบ</v-btn>
      </template>
      <v-skeleton-loader v-else type="heading, paragraph, button" />
    </v-card>
  </main>
</template>

<style scoped>
.invite {
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px;
}

.invite__card {
  width: 100%;
  max-width: 460px;
}
</style>
