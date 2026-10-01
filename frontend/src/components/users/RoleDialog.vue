<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { VForm } from 'vuetify/components'
import { DISCIPLINES, PERMISSION_GROUPS, ROLE_ICONS, ROLE_TONES } from '@/services/role.service'
import type { PermissionKey, Role, RoleInput } from '@/types'
import { required } from '@/utils/validators'

// Create / edit / duplicate a role group: name, discipline, look and permissions by module
const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    /** role to edit, or null to create */
    role?: Role | null
    /** starting point for a new role (duplicate) */
    preset?: Role | null
    loading?: boolean
  }>(),
  { role: null, preset: null, loading: false },
)
const emit = defineEmits<{ save: [input: RoleInput] }>()

const empty = (): RoleInput => ({ name: '', description: '', discipline: 'qa', tone: 'info', icon: 'tabler:user', permissions: [] })
const form = reactive<RoleInput>(empty())
const formRef = ref<VForm>()

const isAdminRole = computed(() => props.role?.builtIn === 'admin')
const title = computed(() => (props.role ? `แก้ไข Role ${props.role.name}` : props.preset ? `สร้าง Role จาก ${props.preset.name}` : 'สร้าง Role'))

watch(open, (isOpen) => {
  if (!isOpen) return
  const src = props.role ?? props.preset
  Object.assign(form, empty(), src ? JSON.parse(JSON.stringify(src)) : {})
  if (!props.role) {
    delete form.id
    if (props.preset) form.name = `${props.preset.name} (สำเนา)`
  }
}, { immediate: true })

const has = (key: PermissionKey) => form.permissions.includes(key)
function toggle(key: PermissionKey, on: boolean | null) {
  form.permissions = on ? [...new Set([...form.permissions, key])] : form.permissions.filter((k) => k !== key)
}
const groupState = (keys: PermissionKey[]) => {
  const n = keys.filter(has).length
  return { all: n === keys.length, some: n > 0 && n < keys.length }
}
function toggleGroup(keys: PermissionKey[], on: boolean | null) {
  form.permissions = on ? [...new Set([...form.permissions, ...keys])] : form.permissions.filter((k) => !keys.includes(k))
}

async function submit() {
  const result = await formRef.value?.validate()
  if (result?.valid) emit('save', JSON.parse(JSON.stringify(form)))
}
</script>

<template>
  <v-dialog v-model="open" max-width="860" scrollable>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-2">
        <div class="d-flex align-center ga-3 overflow-hidden">
          <v-avatar :color="form.tone" size="44"><v-icon :icon="form.icon" /></v-avatar>
          <div class="overflow-hidden">
            <h2 class="text-h5 text-truncate">{{ title }}</h2>
            <p class="text-body-2 text-muted">{{ form.permissions.length }} สิทธิ์</p>
          </div>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-divider />

      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <v-col cols="12" sm="6">
              <label class="fox-label" for="role-name">ชื่อ Role *</label>
              <v-text-field id="role-name" v-model="form.name" placeholder="เช่น QA Lead" :rules="[required]" />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="role-discipline">สายงาน</label>
              <v-select id="role-discipline" v-model="form.discipline" :items="DISCIPLINES" item-title="label" item-value="value" :disabled="isAdminRole">
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
                </template>
              </v-select>
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="role-desc">คำอธิบาย</label>
              <v-textarea id="role-desc" v-model="form.description" rows="2" auto-grow placeholder="หน้าที่และขอบเขตของ Role นี้" />
            </v-col>
            <v-col cols="12" sm="6">
              <div class="fox-label">สี</div>
              <v-chip-group v-model="form.tone" mandatory>
                <v-chip v-for="t in ROLE_TONES" :key="t" :value="t" :color="t" :base-color="t" variant="flat" size="small" :aria-label="t">
                  <v-icon v-if="form.tone === t" icon="tabler:check" size="14" />
                </v-chip>
              </v-chip-group>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="fox-label">ไอคอน</div>
              <v-btn-toggle v-model="form.icon" mandatory density="comfortable" variant="outlined" divided class="flex-wrap">
                <v-btn v-for="i in ROLE_ICONS" :key="i" :value="i" :icon="i" size="small" :aria-label="i" />
              </v-btn-toggle>
            </v-col>
          </v-row>

          <div class="d-flex align-center justify-space-between mt-6 mb-3">
            <span class="text-overline text-muted">สิทธิ์</span>
            <span class="text-caption text-muted">การจัดการผู้ใช้ Role ทีม และโปรเจกต์ เป็นของ Admin เท่านั้น</span>
          </div>
          <v-alert v-if="isAdminRole" type="info" variant="tonal" density="compact" class="mb-3">
            Admin มีทุกสิทธิ์เสมอ แก้ได้เฉพาะชื่อ คำอธิบาย สี และไอคอน
          </v-alert>
          <v-row dense>
            <v-col v-for="g in PERMISSION_GROUPS" :key="g.module" cols="12" md="6">
              <v-card variant="flat" border class="h-100">
                <div class="d-flex align-center ga-2 px-4 pt-3">
                  <v-icon :icon="g.icon" size="18" color="primary" />
                  <span class="text-subtitle-2 flex-grow-1">{{ g.module }}</span>
                  <v-checkbox-btn
                    v-if="g.items.length > 1"
                    :model-value="groupState(g.items.map((i) => i.key)).all"
                    :indeterminate="groupState(g.items.map((i) => i.key)).some"
                    :disabled="isAdminRole"
                    density="compact"
                    :aria-label="`เลือกทุกสิทธิ์ใน ${g.module}`"
                    @update:model-value="toggleGroup(g.items.map((i) => i.key), $event)"
                  />
                </div>
                <div class="px-2 pb-2">
                  <v-checkbox
                    v-for="item in g.items"
                    :key="item.key"
                    :model-value="has(item.key)"
                    :disabled="isAdminRole"
                    density="compact"
                    hide-details
                    @update:model-value="toggle(item.key, $event)"
                  >
                    <template #label>
                      <div class="py-1">
                        <div class="text-body-2">{{ item.label }}</div>
                        <div class="text-caption text-muted">{{ item.description }}</div>
                      </div>
                    </template>
                  </v-checkbox>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />
      <div class="d-flex justify-end ga-3 fox-card-body py-4">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:device-floppy" :loading="loading" @click="submit">{{ role ? 'บันทึก' : 'สร้าง Role' }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
