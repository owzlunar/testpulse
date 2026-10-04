<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxTablePagination from '@/components/ui/FoxTablePagination.vue'
import UserAvatar from '@/components/users/UserAvatar.vue'
import UserDialog from '@/components/users/UserDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { useAuthStore } from '@/stores/auth.store'
import type { User, UserInviteInput } from '@/types'
import { ADMIN_ROLE_ID } from '@/domain/role'

const auth = useAuthStore()
const { users, currentUser, roles, roleOptions } = storeToRefs(auth)
const { snackbar, notify } = useSnackbar()
const { busy: saving, run } = useAsyncAction()

const search = ref('')
// filter: a role id, 'none' (no role yet) or null (all)
const role = ref<string | null>(null)
const roleFilters = computed(() => roleOptions.value.map((o) => ({ ...o, value: o.value ?? 'none' })))
const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return users.value.filter(
    (u) => (!q || `${u.name} ${u.email} ${u.title ?? ''}`.toLowerCase().includes(q)) && (!role.value || (u.roleId ?? 'none') === role.value),
  )
})

const page = ref(1)
const itemsPerPage = ref(10)
watch([search, role], () => (page.value = 1))

const headers = [
  { title: 'ผู้ใช้งาน', key: 'name' },
  { title: 'อีเมล', key: 'email' },
  { title: 'Role', key: 'role', width: 220, sortable: false },
  { title: 'ทีม', key: 'teams', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' },
] as const

const stats = computed(() => [
  { label: 'ผู้ใช้ทั้งหมด', value: users.value.length, icon: 'tabler:users', tone: 'primary' as const },
  { label: 'รอกำหนด Role', value: users.value.filter((u) => !u.roleId).length, icon: 'tabler:user-question', tone: 'warning' as const },
  { label: 'Role ทั้งหมด', value: roles.value.length, icon: 'tabler:shield-lock', tone: 'info' as const },
  { label: 'Admin', value: users.value.filter((u) => u.roleId === ADMIN_ROLE_ID).length, icon: 'tabler:user-shield', tone: 'success' as const },
])

const dialog = ref(false)

function changeRole(u: User, roleId: string | null) {
  run(
    () => auth.updateUserRole(u.id, roleId),
    () => notify(`เปลี่ยน Role ของ ${u.name} เป็น ${auth.roleOf({ roleId }).label} แล้ว`),
  )
}

function switchTo(u: User) {
  run(() => auth.switchUser(u))
}

function onSave(input: UserInviteInput) {
  run(
    () => auth.inviteUser(input),
    () => {
      dialog.value = false
      notify(`เพิ่ม ${input.name} แล้ว ส่งคำเชิญไปที่ ${input.email}`)
    },
  )
}

function resend(u: User) {
  run(
    () => auth.resendInvite(u.id),
    () => notify(`ส่งคำเชิญไปที่ ${u.email} อีกครั้งแล้ว`),
  )
}
</script>

<template>
  <FoxPageHeader :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'ผู้ใช้งาน' }]">
    <template #actions>
      <v-btn color="primary" prepend-icon="tabler:user-plus" @click="dialog = true">เพิ่มผู้ใช้งาน</v-btn>
    </template>
  </FoxPageHeader>

  <div class="fox-stack">
    <v-row class="fox-grid">
      <v-col v-for="s in stats" :key="s.label" cols="12" sm="6" lg="3">
        <FoxStatCard v-bind="s" />
      </v-col>
    </v-row>

    <v-card>
      <div class="fox-card-body">
        <v-row dense class="row-gap-3 align-center">
          <v-col cols="12" md="5" lg="4">
            <v-text-field
              v-model="search"
              density="compact"
              placeholder="ค้นหาชื่อ อีเมล หรือตำแหน่ง"
              prepend-inner-icon="tabler:search"
              aria-label="ค้นหาผู้ใช้"
              clearable
            />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select
              v-model="role"
              :items="roleFilters"
              item-title="label"
              item-value="value"
              density="compact"
              placeholder="ทุก Role"
              aria-label="Role"
              clearable
            />
          </v-col>
        </v-row>
      </div>
      <v-divider />

      <v-data-table v-model:page="page" v-model:items-per-page="itemsPerPage" :headers="headers" :items="filtered" item-value="id">
        <template #[`item.name`]="{ item }">
          <div class="d-flex align-center ga-3 py-2">
            <UserAvatar :user="item" size="40" />
            <div>
              <div class="d-flex align-center ga-2">
                <span class="text-subtitle-2 text-no-wrap">{{ item.name }}</span>
                <v-chip v-if="item.id === currentUser.id" color="primary" size="x-small" variant="flat">คุณ</v-chip>
              </div>
              <div class="text-caption text-muted text-no-wrap">{{ item.title || '-' }}</div>
            </div>
          </div>
        </template>
        <template #[`item.email`]="{ item }">
          <span class="text-muted">{{ item.email }}</span>
        </template>
        <template #[`item.role`]="{ item }">
          <v-select
            :model-value="item.roleId"
            :items="roleOptions"
            item-title="label"
            item-value="value"
            density="compact"
            :aria-label="`Role ของ ${item.name}`"
            @update:model-value="changeRole(item, $event)"
          >
            <template #selection="{ item: { raw } }">
              <v-chip :color="raw.tone" size="small" variant="tonal" :prepend-icon="raw.icon">{{ raw.label }}</v-chip>
            </template>
            <template #item="{ props: opt, item: { raw } }">
              <v-list-item v-bind="opt" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
            </template>
          </v-select>
        </template>
        <template #[`item.teams`]="{ item }">
          <div class="d-flex flex-wrap ga-1 py-2">
            <v-chip v-for="t in auth.teamsOf(item.id)" :key="t.id" :color="t.tone" size="x-small" variant="tonal">{{ t.name }}</v-chip>
            <span v-if="!auth.teamsOf(item.id).length" class="text-caption text-muted">-</span>
          </div>
        </template>
        <template #[`item.actions`]="{ item }">
          <div class="d-flex align-center justify-end ga-2">
            <template v-if="item.status === 'invited'">
              <v-chip color="warning" size="small" variant="tonal" prepend-icon="tabler:mail">รอตอบรับคำเชิญ</v-chip>
              <v-btn variant="text" color="primary" size="small" prepend-icon="tabler:send" @click="resend(item)">ส่งอีกครั้ง</v-btn>
            </template>
            <v-chip v-else-if="item.id === currentUser.id" color="success" size="small" variant="tonal">ใช้งานอยู่</v-chip>
            <v-btn
              v-else-if="auth.canSwitch"
              variant="tonal"
              color="primary"
              size="small"
              prepend-icon="tabler:switch-horizontal"
              @click="switchTo(item)"
            >
              Login as
            </v-btn>
          </div>
        </template>
        <template #no-data>
          <FoxEmptyState icon="tabler:user-search" title="ไม่พบผู้ใช้งาน" text="ลองเปลี่ยนคำค้นหาหรือตัวกรอง" />
        </template>
        <template #bottom>
          <v-divider />
          <FoxTablePagination v-model:page="page" v-model:items-per-page="itemsPerPage" :total="filtered.length" class="fox-card-body py-3" />
        </template>
      </v-data-table>
    </v-card>
  </div>

  <UserDialog v-model="dialog" :loading="saving" @save="onSave" />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
