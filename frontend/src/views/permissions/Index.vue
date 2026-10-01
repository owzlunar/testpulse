<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import RoleDialog from '@/components/users/RoleDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { ALL_PERMISSIONS, DISCIPLINES, PERMISSION_GROUPS, permissionOf } from '@/services/role.service'
import { useAuthStore } from '@/stores/auth.store'
import type { PermissionKey, Role, RoleInput } from '@/types'

// Role groups (Admin only): cards per role, the permission matrix, create / edit / duplicate / delete
const auth = useAuthStore()
const { roles, users, roleOptions } = storeToRefs(auth)
const { snackbar, notify } = useSnackbar()
const { busy, run } = useAsyncAction()

const usersOf = (role: Role) => users.value.filter((u) => u.roleId === role.id)
const disciplineOf = (role: Role) => DISCIPLINES.find((d) => d.value === role.discipline) ?? DISCIPLINES[2]

// --- create / edit / duplicate ---------------------------------------------------------
const dialog = ref(false)
const editing = ref<Role | null>(null)
const preset = ref<Role | null>(null)

function openRole(role: Role | null, copyOf: Role | null = null) {
  editing.value = role
  preset.value = copyOf
  dialog.value = true
}

function onSave(input: RoleInput) {
  run(
    () => auth.saveRole(input),
    (saved) => {
      dialog.value = false
      notify(`${input.id ? 'บันทึก' : 'สร้าง'} Role ${saved.name} แล้ว`)
    },
  )
}

// --- matrix: one switch = one save --------------------------------------------------------
function toggle(role: Role, key: PermissionKey, on: boolean | null) {
  const permissions = on ? [...role.permissions, key] : role.permissions.filter((k) => k !== key)
  run(
    () => auth.saveRole({ ...role, permissions }),
    () => notify(`${on ? 'เปิด' : 'ปิด'}สิทธิ์ "${permissionOf(key)?.label}" ของ ${role.name} แล้ว`),
  )
}

// --- delete: users move to another role (or none) ----------------------------------------
const deleting = ref<Role | null>(null)
const moveTo = ref<string | null>(null)
const deleteOpen = computed({ get: () => !!deleting.value, set: (v) => !v && (deleting.value = null) })
const moveOptions = computed(() => roleOptions.value.filter((o) => o.value !== deleting.value?.id))

function askDelete(role: Role) {
  deleting.value = role
  moveTo.value = null
}

function onDelete() {
  const role = deleting.value
  if (!role) return
  run(() => auth.deleteRole(role.id, moveTo.value), () => {
    deleting.value = null
    notify(`ลบ Role ${role.name} แล้ว`)
  })
}
</script>

<template>
  <FoxPageHeader sticky title="Role และสิทธิ์" :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'Role และสิทธิ์' }]">
    <template #actions>
      <v-btn color="primary" prepend-icon="tabler:plus" @click="openRole(null)">สร้าง Role</v-btn>
    </template>
  </FoxPageHeader>

  <div class="fox-stack">
    <v-row class="fox-grid">
      <v-col v-for="r in roles" :key="r.id" cols="12" sm="6" xl="3">
        <v-card class="fox-card-body h-100 d-flex flex-column">
          <div class="d-flex align-start ga-3 mb-3">
            <v-avatar :color="r.tone" size="48"><v-icon :icon="r.icon" size="24" /></v-avatar>
            <div class="flex-grow-1 overflow-hidden">
              <div class="d-flex flex-wrap align-center ga-2">
                <span class="text-h6">{{ r.name }}</span>
                <v-chip v-if="r.builtIn" size="x-small" color="primary" variant="tonal" prepend-icon="tabler:lock">ระบบ</v-chip>
              </div>
              <div class="d-flex flex-wrap align-center ga-2 text-caption text-muted">
                <span><v-icon :icon="disciplineOf(r).icon" size="14" /> {{ disciplineOf(r).label }}</span>
                <span>· {{ usersOf(r).length }} ผู้ใช้</span>
                <span class="fox-num">· {{ r.permissions.length }} / {{ ALL_PERMISSIONS.length }} สิทธิ์</span>
              </div>
            </div>
          </div>
          <v-progress-linear :model-value="(r.permissions.length / ALL_PERMISSIONS.length) * 100" :color="r.tone" height="6" rounded class="mb-3" />
          <p class="text-body-2 text-muted flex-grow-1">{{ r.description || '-' }}</p>
          <div class="d-flex align-center ga-1 mt-3">
            <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:pencil" @click="openRole(r)">แก้ไข</v-btn>
            <v-btn variant="text" size="small" prepend-icon="tabler:copy" @click="openRole(null, r)">ทำสำเนา</v-btn>
            <v-spacer />
            <v-btn v-if="!r.builtIn" icon="tabler:trash" variant="text" size="small" color="error" :aria-label="`ลบ Role ${r.name}`" @click="askDelete(r)" />
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-card>
      <div class="fox-card-body pb-2">
        <h2 class="text-h5">ตารางสิทธิ์</h2>
        <p class="text-body-2 text-muted">
          มีผลกับผู้ใช้ใน Role นั้นทันที ผู้ใช้ที่ยังไม่มี Role เห็นเฉพาะภาพรวมและตั้งค่า การจัดการผู้ใช้ Role ทีม และโปรเจกต์เป็นของ Admin เท่านั้น
        </p>
      </div>
      <v-table class="role-matrix">
        <thead>
          <tr>
            <th>สิทธิ์</th>
            <th v-for="r in roles" :key="r.id" class="text-center">
              <v-chip :color="r.tone" size="small" variant="tonal" :prepend-icon="r.icon">{{ r.name }}</v-chip>
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="g in PERMISSION_GROUPS" :key="g.module">
            <tr class="role-matrix__group">
              <td :colspan="roles.length + 1">
                <div class="d-flex align-center ga-2 text-subtitle-2"><v-icon :icon="g.icon" size="18" color="primary" />{{ g.module }}</div>
              </td>
            </tr>
            <tr v-for="item in g.items" :key="item.key">
              <td>
                <div class="py-2">
                  <div class="text-body-2">{{ item.label }}</div>
                  <div class="text-caption text-muted">{{ item.description }}</div>
                </div>
              </td>
              <td v-for="r in roles" :key="r.id" class="text-center">
                <v-checkbox-btn
                  class="d-inline-flex"
                  :model-value="r.permissions.includes(item.key)"
                  :disabled="busy || !!r.builtIn"
                  :color="r.tone"
                  :aria-label="`${item.label} สำหรับ ${r.name}`"
                  @update:model-value="toggle(r, item.key, $event)"
                />
              </td>
            </tr>
          </template>
        </tbody>
      </v-table>
    </v-card>
  </div>

  <RoleDialog v-model="dialog" :role="editing" :preset="preset" :loading="busy" @save="onSave" />

  <v-dialog v-model="deleteOpen" max-width="460">
    <v-card v-if="deleting" class="fox-card-body">
      <h2 class="text-h5 mb-2">ลบ Role {{ deleting.name }}?</h2>
      <p class="text-body-2 text-muted mb-4">
        <template v-if="usersOf(deleting).length">
          ผู้ใช้ {{ usersOf(deleting).length }} คนใน Role นี้ ({{ usersOf(deleting).map((u) => u.name).join(', ') }}) จะถูกย้ายไป Role ที่เลือก
        </template>
        <template v-else>ไม่มีผู้ใช้ใน Role นี้</template>
      </p>
      <template v-if="usersOf(deleting).length">
        <label class="fox-label" for="role-move">ย้ายผู้ใช้ไปที่</label>
        <v-select id="role-move" v-model="moveTo" :items="moveOptions" item-title="label" item-value="value">
          <template #item="{ props: item, item: { raw } }">
            <v-list-item v-bind="item" :prepend-icon="raw.icon" :base-color="raw.tone" />
          </template>
        </v-select>
      </template>
      <div class="d-flex justify-end ga-3 mt-4">
        <v-btn variant="outlined" @click="deleting = null">ยกเลิก</v-btn>
        <v-btn color="error" prepend-icon="tabler:trash" :loading="busy" @click="onDelete">ลบ Role</v-btn>
      </div>
    </v-card>
  </v-dialog>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.role-matrix__group td {
  background: rgba(var(--v-theme-primary), 0.04);
}
</style>
