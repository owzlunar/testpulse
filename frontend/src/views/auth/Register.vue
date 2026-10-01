<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { VForm } from 'vuetify/components'
import AppLogo from '@/components/layout/AppLogo.vue'
import { DEFAULT_AVATAR } from '@/services/user.service'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useAuthStore } from '@/stores/auth.store'
import * as v from '@/utils/validators'

const auth = useAuthStore()

const titles = ['QA Lead', 'Senior QA Tester', 'Automation Engineer', 'Manual Tester']
const formRef = ref<VForm>()
const form = reactive({ name: '', email: '', title: titles[1], password: '' })
const showPw = ref(false)
const { busy, run } = useAsyncAction()

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  await run(async () => {
    const user = await auth.addUser({ name: form.name, email: form.email, roleId: null, title: form.title, avatar: DEFAULT_AVATAR })
    await auth.switchUser(user, '/dashboard')
  })
}
</script>

<template>
  <main class="register bg-background">
    <v-card class="register__card fox-card-body">
      <AppLogo class="mb-8" />
      <h1 class="text-h2 mb-1">สมัครสมาชิก</h1>
      <p class="text-body-1 text-muted mb-8">สร้างบัญชี QA Tester เพื่อจัดการ Test Case และรายงานผล</p>

      <v-form ref="formRef" @submit.prevent="submit">
        <v-row dense class="fox-form-grid">
          <v-col cols="12">
            <label class="fox-label" for="reg-name">ชื่อ-นามสกุล *</label>
            <v-text-field id="reg-name" v-model="form.name" prepend-inner-icon="tabler:user" placeholder="สมชาย ประเสริฐ" :rules="[v.required]" />
          </v-col>
          <v-col cols="12">
            <label class="fox-label" for="reg-email">อีเมล *</label>
            <v-text-field id="reg-email" v-model="form.email" type="email" autocomplete="email" prepend-inner-icon="tabler:mail" :rules="[v.required, v.email]" />
          </v-col>
          <v-col cols="12">
            <label class="fox-label" for="reg-title">ตำแหน่ง</label>
            <v-select id="reg-title" v-model="form.title" :items="titles" prepend-inner-icon="tabler:id" />
          </v-col>
          <v-col cols="12">
            <label class="fox-label" for="reg-pw">รหัสผ่าน *</label>
            <v-text-field
              id="reg-pw"
              v-model="form.password"
              :type="showPw ? 'text' : 'password'"
              autocomplete="new-password"
              prepend-inner-icon="tabler:lock"
              :append-inner-icon="showPw ? 'tabler:eye-off' : 'tabler:eye'"
              :rules="[v.required, v.minLength(6)]"
              @click:append-inner="showPw = !showPw"
            />
          </v-col>
          <v-col cols="12">
            <v-btn block color="primary" size="large" type="submit" :loading="busy">สมัครสมาชิก</v-btn>
          </v-col>
        </v-row>
      </v-form>

      <p class="text-body-1 text-center text-muted mt-8 mb-0">
        มีบัญชีอยู่แล้ว?
        <router-link to="/login" class="text-primary font-weight-medium text-decoration-none">เข้าสู่ระบบ</router-link>
      </p>
    </v-card>
  </main>
</template>

<style scoped>
.register {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 40px var(--fox-gutter);
}

.register__card {
  width: 100%;
  max-width: 480px;
}
</style>
