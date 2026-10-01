<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLES, roleOf } from '@/services/user.service'
import { useAuthStore } from '@/stores/auth.store'
import type { PermissionKey, RolePermission, UserRole } from '@/types'

const auth = useAuthStore()
const { permissions } = storeToRefs(auth)
const { snackbar, notify } = useSnackbar()
const confirmReset = ref(false)
const { busy, run } = useAsyncAction()

const permOf = (role: UserRole) => permissions.value.find((p) => p.role === role)
const granted = (role: UserRole, key: PermissionKey) => !!permOf(role)?.[key]
const countOf = (p: RolePermission) => PERMISSIONS.filter((row) => p[row.key]).length

function toggle(role: UserRole, key: PermissionKey, value: boolean | null) {
  const row = PERMISSIONS.find((r) => r.key === key)
  run(
    () => auth.updatePermission(role, { [key]: !!value }),
    () => notify(`${value ? 'เปิด' : 'ปิด'}สิทธิ์ "${row?.label}" ของ ${roleOf(role).label} แล้ว`),
  )
}

function reset() {
  run(
    () => Promise.all(DEFAULT_ROLE_PERMISSIONS.map((p) => auth.updatePermission(p.role, { ...p }))),
    () => notify('คืนค่าสิทธิ์เริ่มต้นแล้ว'),
  )
}
</script>

<template>
  <FoxPageHeader title="สิทธิ์การใช้งาน" :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'สิทธิ์การใช้งาน' }]">
    <template #actions>
      <v-btn variant="outlined" prepend-icon="tabler:restore" :loading="busy" @click="confirmReset = true">คืนค่าเริ่มต้น</v-btn>
    </template>
  </FoxPageHeader>

  <div class="fox-stack">
    <v-row class="fox-grid">
      <v-col v-for="p in permissions" :key="p.role" cols="12" md="4">
        <v-card class="fox-card-body h-100">
          <div class="d-flex align-center ga-4 mb-3">
            <v-avatar :color="roleOf(p.role).tone" size="48">
              <v-icon :icon="roleOf(p.role).icon" size="24" />
            </v-avatar>
            <div class="flex-grow-1">
              <div class="text-h6">{{ roleOf(p.role).label }}</div>
              <div class="text-body-2 text-muted fox-num">{{ countOf(p) }} / {{ PERMISSIONS.length }} สิทธิ์</div>
            </div>
          </div>
          <v-progress-linear :model-value="(countOf(p) / PERMISSIONS.length) * 100" :color="roleOf(p.role).tone" height="6" rounded class="mb-3" />
          <p class="text-body-2 text-muted mb-0">{{ p.description }}</p>
        </v-card>
      </v-col>
    </v-row>

    <v-card>
      <div class="fox-card-body pb-2">
        <h2 class="text-h5">ตาราง RBAC</h2>
        <p class="text-body-2 text-muted">การเปลี่ยนแปลงมีผลกับผู้ใช้ใน Role นั้นทันที</p>
      </div>
      <v-table>
        <thead>
          <tr>
            <th>ความสามารถ</th>
            <th v-for="r in ROLES" :key="r.value" class="text-center">
              <v-chip :color="r.tone" size="small" variant="tonal" :prepend-icon="r.icon">{{ r.label }}</v-chip>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in PERMISSIONS" :key="row.key">
            <td>
              <div class="d-flex align-center ga-3 py-2">
                <v-avatar color="primary" size="36" rounded="lg"><v-icon :icon="row.icon" size="18" /></v-avatar>
                <div>
                  <div class="text-subtitle-2">{{ row.label }}</div>
                  <div class="text-caption text-muted">{{ row.description }}</div>
                </div>
              </div>
            </td>
            <td v-for="r in ROLES" :key="r.value" class="text-center">
              <v-switch
                class="d-inline-flex"
                :model-value="granted(r.value, row.key)"
                :disabled="busy"
                :color="r.tone"
                :aria-label="`${row.label} สำหรับ ${r.label}`"
                @update:model-value="toggle(r.value, row.key, $event)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
  </div>

  <FoxConfirmDialog
    v-model="confirmReset"
    title="คืนค่าสิทธิ์เริ่มต้น?"
    text="ตาราง RBAC ทุก Role จะกลับเป็นค่าตาม PRD"
    confirm-text="คืนค่า"
    tone="warning"
    @confirm="reset"
  />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
