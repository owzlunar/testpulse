<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import type { VForm } from 'vuetify/components'
import RolePermissionEditor from './RolePermissionEditor.vue'
import { DISCIPLINES, ROLE_ICONS, ROLE_TONES } from '@/services/role.service'
import type { Role, RoleInput } from '@/types'
import { required } from '@/utils/validators'

// Create / edit / duplicate a role group: name, discipline, look and permissions by module
const open = defineModel<boolean>({ default: false })
const props = withDefaults(
  defineProps<{
    /** role to edit, or null to create */
    role?: Role | null
    /** starting point for a new role (duplicate) */
    preset?: Role | null
    /** false: name, discipline and look only (the role page edits permissions in place) */
    withPermissions?: boolean
    loading?: boolean
  }>(),
  { role: null, preset: null, withPermissions: true, loading: false },
)
const emit = defineEmits<{ save: [input: RoleInput] }>()

const empty = (): RoleInput => ({ name: '', description: '', discipline: 'qa', tone: 'info', icon: 'tabler:user', permissions: [] })
const form = reactive<RoleInput>(empty())
const formRef = ref<VForm>()

const isAdminRole = computed(() => props.role?.builtIn === 'admin')
const title = computed(() => (props.role ? `แก้ไข Role ${props.role.name}` : props.preset ? `สร้าง Role จาก ${props.preset.name}` : 'สร้าง Role'))

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const src = props.role ?? props.preset
    Object.assign(form, empty(), src ? JSON.parse(JSON.stringify(src)) : {})
    if (!props.role) {
      // a copy is a new, ordinary role: never the built-in Admin, whatever it was copied from
      const copy = form as RoleInput & Partial<Pick<Role, 'builtIn' | 'createdAt' | 'updatedAt'>>
      delete copy.id
      delete copy.builtIn
      delete copy.createdAt
      delete copy.updatedAt
      if (props.preset) form.name = `${props.preset.name} (สำเนา)`
    }
  },
  { immediate: true },
)
useUnsavedChanges(open, () => form)

async function submit() {
  const result = await formRef.value?.validate()
  if (result?.valid) emit('save', JSON.parse(JSON.stringify(form)))
}
</script>

<template>
  <v-dialog v-model="open" :max-width="withPermissions ? 860 : 600" scrollable>
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
              <v-select
                id="role-discipline"
                v-model="form.discipline"
                :items="DISCIPLINES"
                item-title="label"
                item-value="value"
                :disabled="isAdminRole"
              >
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
              <!-- v-item-group, not v-chip-group: Vuetify 3.5 colours only the selected chip in a chip group -->
              <v-item-group v-model="form.tone" mandatory class="d-flex flex-wrap ga-2">
                <v-item v-for="t in ROLE_TONES" :key="t" v-slot="{ isSelected, toggle }" :value="t">
                  <v-btn icon :color="t" variant="flat" size="small" rounded="circle" :aria-label="t" :aria-pressed="isSelected" @click="toggle">
                    <v-icon v-if="isSelected" icon="tabler:check" />
                  </v-btn>
                </v-item>
              </v-item-group>
            </v-col>
            <v-col cols="12" sm="6">
              <div class="fox-label">ไอคอน</div>
              <v-item-group v-model="form.icon" mandatory class="d-flex flex-wrap ga-2">
                <v-item v-for="i in ROLE_ICONS" :key="i" v-slot="{ isSelected, toggle }" :value="i">
                  <v-btn
                    :icon="i"
                    :color="isSelected ? 'primary' : undefined"
                    :variant="isSelected ? 'flat' : 'outlined'"
                    size="small"
                    rounded="circle"
                    :aria-label="i"
                    :aria-pressed="isSelected"
                    @click="toggle"
                  />
                </v-item>
              </v-item-group>
            </v-col>
          </v-row>

          <template v-if="withPermissions">
            <div class="d-flex align-center justify-space-between mt-6 mb-3">
              <span class="text-overline text-muted">สิทธิ์</span>
              <span class="text-caption text-muted">การจัดการผู้ใช้ Role ทีม และโปรเจกต์ เป็นของ Admin เท่านั้น</span>
            </div>
            <v-alert v-if="isAdminRole" type="info" variant="tonal" density="compact" class="mb-3">
              Admin มีทุกสิทธิ์เสมอ แก้ได้เฉพาะชื่อ คำอธิบาย สี และไอคอน
            </v-alert>
            <RolePermissionEditor v-model="form.permissions" :disabled="isAdminRole" />
          </template>
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
