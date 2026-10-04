<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLeaveGuard } from '@/composables/useUnsavedChanges'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useDisplay } from 'vuetify'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import UserAvatar from '@/components/users/UserAvatar.vue'
import RoleDialog from '@/components/users/RoleDialog.vue'
import RolePermissionEditor from '@/components/users/RolePermissionEditor.vue'
import RoleCompareTable from '@/components/users/RoleCompareTable.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { useAuthStore } from '@/stores/auth.store'
import type { PermissionKey, Role, RoleInput } from '@/types'
import { ALL_PERMISSIONS, DISCIPLINES } from '@/domain/role'

// Role groups (Admin only). Tab "Role": the list on the left, the selected role's permissions on the
// right (edited as a draft, saved explicitly). Tab "เปรียบเทียบสิทธิ์": read-only matrix of picked roles.
const auth = useAuthStore()
const { roles, users, roleOptions } = storeToRefs(auth)
const { snackbar, notify } = useSnackbar()
const { busy, run } = useAsyncAction()
const route = useRoute()
const router = useRouter()
const { mdAndUp } = useDisplay()

const tab = ref<'roles' | 'compare'>(route.query.tab === 'compare' ? 'compare' : 'roles')
watch(tab, (t) => router.replace({ query: { ...route.query, tab: t === 'compare' ? 'compare' : undefined } }))

const usersOf = (role: Role) => users.value.filter((u) => u.roleId === role.id)
const disciplineOf = (role: Role) => DISCIPLINES.find((d) => d.value === role.discipline) ?? DISCIPLINES[2]

// --- list ---------------------------------------------------------------------------------
const search = ref('')
const listed = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return roles.value.filter((r) => !q || `${r.name} ${r.description}`.toLowerCase().includes(q))
})

// --- selection (kept in the URL) and the permission draft -----------------------------------
const selectedId = ref<string | null>(typeof route.query.role === 'string' ? route.query.role : null)
const selected = computed(() => roles.value.find((r) => r.id === selectedId.value) ?? (mdAndUp.value ? roles.value[0] : null) ?? null)
/** phones show the list or the detail, not both */
const showDetail = computed(() => mdAndUp.value || (!!selected.value && !!selectedId.value))

const draft = ref<PermissionKey[]>([])
const sorted = (keys: PermissionKey[]) => [...keys].sort().join()
const dirty = computed(() => !!selected.value && sorted(draft.value) !== sorted(selected.value.permissions))
useLeaveGuard(() => dirty.value)
const changes = computed(() => {
  if (!selected.value) return 0
  const saved = new Set(selected.value.permissions)
  const now = new Set(draft.value)
  return ALL_PERMISSIONS.filter((k) => saved.has(k) !== now.has(k)).length
})

// a new role selected (or the saved role changed): start the draft from what is saved
watch(
  () => [selected.value?.id, selected.value?.updatedAt],
  () => (draft.value = [...(selected.value?.permissions ?? [])]),
  { immediate: true },
)

const pendingSelect = ref<string | null>(null)
const discardOpen = computed({ get: () => pendingSelect.value !== null, set: (v) => !v && (pendingSelect.value = null) })

function select(id: string | null) {
  if (dirty.value && id !== selected.value?.id) {
    pendingSelect.value = id ?? ''
    return
  }
  selectedId.value = id
  router.replace({ query: { ...route.query, role: id ?? undefined } })
}

function discardAndSelect() {
  const id = pendingSelect.value
  pendingSelect.value = null
  draft.value = [...(selected.value?.permissions ?? [])]
  select(id || null)
}

function savePermissions() {
  const role = selected.value
  if (!role) return
  run(
    () => auth.saveRole({ ...role, permissions: draft.value }),
    () => notify(`บันทึกสิทธิ์ของ ${role.name} แล้ว`),
  )
}

function openFromCompare(id: string) {
  tab.value = 'roles'
  select(id)
}

// --- create / duplicate / edit details -------------------------------------------------------
const dialog = ref(false)
const editing = ref<Role | null>(null)
const preset = ref<Role | null>(null)

function openRole(role: Role | null, copyOf: Role | null = null) {
  editing.value = role
  preset.value = copyOf
  dialog.value = true
}

function onSave(input: RoleInput) {
  // "แก้ไขข้อมูล" leaves permissions to the panel: keep what is saved, the draft stays as it is
  const payload = editing.value ? { ...input, permissions: editing.value.permissions } : input
  run(
    () => auth.saveRole(payload),
    (saved) => {
      dialog.value = false
      notify(`${input.id ? 'บันทึก' : 'สร้าง'} Role ${saved.name} แล้ว`)
      if (!input.id) select(saved.id)
    },
  )
}

// --- delete: users move to another role (or none) --------------------------------------------
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
  run(
    () => auth.deleteRole(role.id, moveTo.value),
    () => {
      deleting.value = null
      draft.value = []
      selectedId.value = null
      router.replace({ query: { ...route.query, role: undefined } })
      notify(`ลบ Role ${role.name} แล้ว`)
    },
  )
}
</script>

<template>
  <FoxPageHeader sticky :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'Role และสิทธิ์' }]">
    <template #actions>
      <v-btn color="primary" prepend-icon="tabler:plus" @click="openRole(null)">สร้าง Role</v-btn>
    </template>
  </FoxPageHeader>

  <v-tabs v-model="tab" class="mb-4">
    <v-tab value="roles" prepend-icon="tabler:shield-lock"
      >Role <span class="text-caption text-muted fox-num ml-1">{{ roles.length }}</span></v-tab
    >
    <v-tab value="compare" prepend-icon="tabler:columns">เปรียบเทียบสิทธิ์</v-tab>
  </v-tabs>

  <!-- plain v-if, not v-window: v-window clips overflow, which would stop the sticky list and save bar -->
  <!-- ROLES: list + detail -->
  <template v-if="tab === 'roles'">
    <v-row class="fox-grid">
      <v-col v-if="mdAndUp || !showDetail" cols="12" md="4" lg="3">
        <v-card class="role-list">
          <div class="pa-3">
            <v-text-field
              v-model="search"
              density="compact"
              placeholder="ค้นหา Role"
              prepend-inner-icon="tabler:search"
              aria-label="ค้นหา Role"
              hide-details
              clearable
            />
          </div>
          <v-divider />
          <v-list density="compact" nav class="role-list__items">
            <v-list-item v-for="r in listed" :key="r.id" :active="r.id === selected?.id" color="primary" class="py-2" @click="select(r.id)">
              <template #prepend>
                <v-avatar :color="r.tone" size="32" class="mr-3"><v-icon :icon="r.icon" size="16" /></v-avatar>
              </template>
              <v-list-item-title class="text-subtitle-2">{{ r.name }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ disciplineOf(r).label }} · {{ usersOf(r).length }} ผู้ใช้</v-list-item-subtitle>
              <template #append>
                <v-icon v-if="r.builtIn" icon="tabler:lock" size="14" class="text-muted" title="Role ของระบบ" />
              </template>
            </v-list-item>
            <v-list-item v-if="!listed.length" class="text-body-2 text-muted">ไม่พบ Role</v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <v-col v-if="showDetail && selected" cols="12" md="8" lg="9">
        <v-card class="overflow-visible">
          <div class="fox-card-body">
            <v-btn v-if="!mdAndUp" variant="text" size="small" prepend-icon="tabler:arrow-left" class="mb-2 px-1" @click="select(null)"
              >รายการ Role</v-btn
            >
            <div class="d-flex flex-wrap align-start ga-4">
              <v-avatar :color="selected.tone" size="56"><v-icon :icon="selected.icon" size="28" /></v-avatar>
              <div class="flex-grow-1 overflow-hidden">
                <div class="d-flex flex-wrap align-center ga-2">
                  <h2 class="text-h5">{{ selected.name }}</h2>
                  <v-chip v-if="selected.builtIn" size="x-small" color="primary" variant="tonal" prepend-icon="tabler:lock">ระบบ</v-chip>
                </div>
                <div class="text-body-2 text-muted">
                  <v-icon :icon="disciplineOf(selected).icon" size="14" /> {{ disciplineOf(selected).label }} ·
                  <span class="fox-num">{{ selected.permissions.length }} / {{ ALL_PERMISSIONS.length }}</span> สิทธิ์
                </div>
                <p class="text-body-2 mt-1 mb-0">{{ selected.description || '-' }}</p>
              </div>
              <div class="d-flex flex-wrap ga-1">
                <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:pencil" @click="openRole(selected)">แก้ไขข้อมูล</v-btn>
                <v-btn variant="text" size="small" prepend-icon="tabler:copy" @click="openRole(null, selected)">ทำสำเนา</v-btn>
                <v-btn
                  v-if="!selected.builtIn"
                  icon="tabler:trash"
                  variant="text"
                  size="small"
                  color="error"
                  :aria-label="`ลบ Role ${selected.name}`"
                  @click="askDelete(selected)"
                />
              </div>
            </div>

            <div class="text-overline text-muted mt-4">ผู้ใช้ใน Role นี้ ({{ usersOf(selected).length }})</div>
            <div v-if="usersOf(selected).length" class="d-flex flex-wrap ga-2">
              <v-chip v-for="u in usersOf(selected)" :key="u.id" size="small" variant="tonal">
                <template #prepend><UserAvatar :user="u" size="18" class="mr-1" /></template>
                {{ u.name }}
              </v-chip>
            </div>
            <p v-else class="text-body-2 text-muted mb-0">ยังไม่มีผู้ใช้ (กำหนด Role ได้ที่หน้าผู้ใช้งาน)</p>

            <div class="d-flex align-center justify-space-between mt-6 mb-3">
              <span class="text-overline text-muted">สิทธิ์</span>
              <span class="text-caption text-muted">การจัดการผู้ใช้ Role ทีม และโปรเจกต์ เป็นของ Admin เท่านั้น</span>
            </div>
            <v-alert v-if="selected.builtIn" type="info" variant="tonal" density="compact" class="mb-3">Admin มีทุกสิทธิ์เสมอ</v-alert>
            <RolePermissionEditor v-model="draft" :disabled="!!selected.builtIn || busy" />
          </div>

          <!-- explicit save: permissions are not written on every click -->
          <div v-if="!selected.builtIn" class="role-savebar d-flex flex-wrap align-center ga-3 fox-card-body py-3">
            <span v-if="dirty" class="text-body-2 text-warning d-inline-flex align-center ga-1">
              <v-icon icon="tabler:point-filled" size="14" />ยังไม่ได้บันทึก {{ changes }} การเปลี่ยนแปลง
            </span>
            <span v-else class="text-body-2 text-muted">บันทึกแล้ว · มีผลกับผู้ใช้ใน Role นี้ทันทีที่บันทึก</span>
            <v-spacer />
            <v-btn variant="outlined" :disabled="!dirty || busy" @click="draft = [...selected.permissions]">ยกเลิก</v-btn>
            <v-btn color="primary" prepend-icon="tabler:device-floppy" :disabled="!dirty" :loading="busy" @click="savePermissions"
              >บันทึกสิทธิ์</v-btn
            >
          </div>
        </v-card>
      </v-col>
    </v-row>
  </template>

  <!-- COMPARE -->
  <RoleCompareTable v-else :roles="roles" :users="users" @open="openFromCompare" />

  <RoleDialog v-model="dialog" :role="editing" :preset="preset" :with-permissions="!editing" :loading="busy" @save="onSave" />

  <FoxConfirmDialog
    v-model="discardOpen"
    title="ทิ้งการแก้ไขสิทธิ์?"
    :text="`สิทธิ์ของ ${selected?.name ?? ''} ที่ยังไม่ได้บันทึก (${changes} การเปลี่ยนแปลง) จะหายไป`"
    confirm-text="ทิ้งการแก้ไข"
    tone="warning"
    @confirm="discardAndSelect"
  />

  <v-dialog v-model="deleteOpen" max-width="460">
    <v-card v-if="deleting" class="fox-card-body">
      <h2 class="text-h5 mb-2">ลบ Role {{ deleting.name }}?</h2>
      <p class="text-body-2 text-muted mb-4">
        <template v-if="usersOf(deleting).length">
          ผู้ใช้ {{ usersOf(deleting).length }} คนใน Role นี้ ({{
            usersOf(deleting)
              .map((u) => u.name)
              .join(', ')
          }}) จะถูกย้ายไป Role ที่เลือก
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
/* the list scrolls on its own and stays beside the detail */
.role-list {
  position: sticky;
  top: calc(var(--fox-appbar-height) + 72px);
}

.role-list__items {
  max-height: calc(100vh - var(--fox-appbar-height) - 220px);
  overflow-y: auto;
}

/* save bar stays at the bottom of the screen while the permissions scroll */
.role-savebar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  border-radius: 0 0 var(--fox-radius-card) var(--fox-radius-card);
}
</style>
