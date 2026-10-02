<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { VForm } from 'vuetify/components'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useAuthStore } from '@/stores/auth.store'
import * as v from '@/utils/validators'

// Change the signed-in user's password (the server signs out their other sessions)
const emit = defineEmits<{ changed: [] }>()
const auth = useAuthStore()
const { busy, run } = useAsyncAction()
const formRef = ref<VForm>()
const form = reactive({ current: '', next: '', confirm: '' })
const show = ref(false)

const sameAsNew = (value: unknown) => value === form.next || 'รหัสผ่านไม่ตรงกัน'

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  run(
    () => auth.changePassword(form.current, form.next),
    () => {
      formRef.value?.reset()
      emit('changed')
    },
  )
}
</script>

<template>
  <v-form ref="formRef" @submit.prevent="submit">
    <div class="text-subtitle-2 mb-3">เปลี่ยนรหัสผ่าน</div>
    <label class="fox-label" for="pw-current">รหัสผ่านปัจจุบัน</label>
    <v-text-field id="pw-current" v-model="form.current" :type="show ? 'text' : 'password'" autocomplete="current-password" :rules="[v.required]" />
    <label class="fox-label mt-3" for="pw-new">รหัสผ่านใหม่</label>
    <v-text-field
      id="pw-new"
      v-model="form.next"
      :type="show ? 'text' : 'password'"
      autocomplete="new-password"
      :rules="[v.required, v.minLength(8)]"
      :append-inner-icon="show ? 'tabler:eye-off' : 'tabler:eye'"
      @click:append-inner="show = !show"
    />
    <label class="fox-label mt-3" for="pw-confirm">ยืนยันรหัสผ่านใหม่</label>
    <v-text-field
      id="pw-confirm"
      v-model="form.confirm"
      :type="show ? 'text' : 'password'"
      autocomplete="new-password"
      :rules="[v.required, sameAsNew]"
    />
    <v-btn color="primary" type="submit" class="mt-4" :loading="busy" prepend-icon="tabler:lock">เปลี่ยนรหัสผ่าน</v-btn>
  </v-form>
</template>
