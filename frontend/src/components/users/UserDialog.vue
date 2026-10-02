<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { storeToRefs } from 'pinia'
import type { VForm } from 'vuetify/components'
import { useAuthStore } from '@/stores/auth.store'
import type { User } from '@/types'
import * as v from '@/utils/validators'
import { DEFAULT_AVATAR } from '@/domain/user'

const open = defineModel<boolean>({ default: false })
withDefaults(defineProps<{ loading?: boolean }>(), { loading: false })
const emit = defineEmits<{ save: [user: Omit<User, 'id'>] }>()

const formRef = ref<VForm>()
const empty = (): Omit<User, 'id'> => ({ name: '', email: '', title: '', roleId: null, avatar: DEFAULT_AVATAR })

// roles created on the "Role และสิทธิ์" page; a user may start without one
const { roleOptions } = storeToRefs(useAuthStore())
const form = reactive(empty())

watch(open, (isOpen) => isOpen && Object.assign(form, empty()), { immediate: true })
useUnsavedChanges(open, () => form)

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  emit('save', { ...form })
}
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">เพิ่มผู้ใช้งาน</h2>
          <p class="text-body-2 text-muted">ช่องที่มี * จำเป็นต้องกรอก</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <v-col cols="12">
              <label class="fox-label" for="usr-name">ชื่อ-นามสกุล *</label>
              <v-text-field id="usr-name" v-model="form.name" placeholder="เช่น วีระศักดิ์ มั่นคง" :rules="[v.required]" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="usr-email">อีเมล *</label>
              <v-text-field id="usr-email" v-model="form.email" type="email" prepend-inner-icon="tabler:mail" :rules="[v.required, v.email]" />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="usr-title">ตำแหน่ง</label>
              <v-text-field id="usr-title" v-model="form.title" placeholder="เช่น Frontend Engineer" />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="usr-role">Role</label>
              <v-select id="usr-role" v-model="form.roleId" :items="roleOptions" item-title="label" item-value="value">
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
                </template>
              </v-select>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <div class="d-flex justify-end ga-3 fox-card-body pt-0">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" :loading="loading" @click="submit">บันทึก</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
