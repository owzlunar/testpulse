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
import { ROLES, roleOf } from '@/services/user.service'
import { useAuthStore } from '@/stores/auth.store'
import type { User, UserRole } from '@/types'

const auth = useAuthStore()
const { users, currentUser } = storeToRefs(auth)
const { snackbar, notify } = useSnackbar()
const { busy: saving, run } = useAsyncAction()

const search = ref('')
const role = ref<UserRole | null>(null)
const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return users.value.filter(
    (u) => (!q || `${u.name} ${u.email} ${u.title ?? ''}`.toLowerCase().includes(q)) && (!role.value || u.role === role.value),
  )
})

const page = ref(1)
const itemsPerPage = ref(10)
watch([search, role], () => (page.value = 1))

const headers = [
  { title: 'ผู้ใช้งาน', key: 'name' },
  { title: 'อีเมล', key: 'email' },
  { title: 'Role', key: 'role', width: 220, sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' },
] as const

const stats = computed(() => [
  { label: 'ผู้ใช้ทั้งหมด', value: users.value.length, icon: 'tabler:users', tone: 'primary' as const },
  ...ROLES.map((r) => ({ label: r.label, value: users.value.filter((u) => u.role === r.value).length, icon: r.icon, tone: r.tone })),
])

const dialog = ref(false)

function changeRole(u: User, r: UserRole) {
  run(() => auth.updateUserRole(u.id, r), () => notify(`เปลี่ยน Role ของ ${u.name} เป็น ${roleOf(r).label} แล้ว`))
}

function switchTo(u: User) {
  run(() => auth.loginAs(u), () => notify(`สลับเป็น ${u.name} (${roleOf(u.role).label}) แล้ว`))
}

function onSave(input: Omit<User, 'id'>) {
  run(
    () => auth.addUser(input),
    () => {
      dialog.value = false
      notify(`เพิ่ม ${input.name} แล้ว`)
    },
  )
}
</script>

<template>
  <FoxPageHeader title="ผู้ใช้งาน" :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'ผู้ใช้งาน' }]">
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
            <v-text-field v-model="search" density="compact" placeholder="ค้นหาชื่อ อีเมล หรือตำแหน่ง" prepend-inner-icon="tabler:search" aria-label="ค้นหาผู้ใช้" clearable />
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-select v-model="role" :items="ROLES" item-title="label" item-value="value" density="compact" placeholder="ทุก Role" aria-label="Role" clearable />
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
            :model-value="item.role"
            :items="ROLES"
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
        <template #[`item.actions`]="{ item }">
          <v-btn v-if="item.id !== currentUser.id" variant="tonal" color="primary" size="small" prepend-icon="tabler:switch-horizontal" @click="switchTo(item)">
            Login as
          </v-btn>
          <v-chip v-else color="success" size="small" variant="tonal">ใช้งานอยู่</v-chip>
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
