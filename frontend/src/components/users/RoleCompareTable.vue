<script setup lang="ts">
import { computed, ref } from 'vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { PERMISSION_GROUPS } from '@/services/role.service'
import type { PermissionKey, Role, User } from '@/types'

// Read-only permission matrix for the roles picked (pinned header and first column, collapsible modules,
// "differences only"). Editing happens on the role's own page: click a role name to open it.
const props = defineProps<{ roles: Role[]; users: User[] }>()
const emit = defineEmits<{ open: [roleId: string] }>()

const userCount = (r: Role) => props.users.filter((u) => u.roleId === r.id).length

// default: the 5 most used roles besides Admin (who has everything anyway)
const picked = ref<string[]>(
  [...props.roles]
    .filter((r) => !r.builtIn)
    .sort((a, b) => userCount(b) - userCount(a))
    .slice(0, 5)
    .map((r) => r.id),
)
const columns = computed(() => props.roles.filter((r) => picked.value.includes(r.id)))
const diffOnly = ref(false)
const collapsed = ref(new Set<string>())

const granted = (r: Role, key: PermissionKey) => r.builtIn === 'admin' || r.permissions.includes(key)
const differs = (key: PermissionKey) => new Set(columns.value.map((r) => granted(r, key))).size > 1
const rowsOf = (g: (typeof PERMISSION_GROUPS)[number]) => g.items.filter((i) => !diffOnly.value || differs(i.key))
const groups = computed(() => PERMISSION_GROUPS.filter((g) => rowsOf(g).length))
const countIn = (r: Role, g: (typeof PERMISSION_GROUPS)[number]) => g.items.filter((i) => granted(r, i.key)).length

function toggleGroup(module: string) {
  const next = new Set(collapsed.value)
  if (next.has(module)) next.delete(module)
  else next.add(module)
  collapsed.value = next
}
</script>

<template>
  <v-card>
    <div class="fox-card-body">
      <v-row dense class="align-center row-gap-3">
        <v-col cols="12" md="8">
          <v-autocomplete
            v-model="picked"
            :items="roles"
            item-title="name"
            item-value="id"
            multiple
            chips
            closable-chips
            density="compact"
            prepend-inner-icon="tabler:shield-lock"
            placeholder="เลือก Role ที่ต้องการเทียบ"
            aria-label="Role ที่ต้องการเทียบ"
            hide-details
          >
            <template #chip="{ props: chip, item }">
              <v-chip v-bind="chip" size="small" :color="item.raw.tone" variant="tonal" :prepend-icon="item.raw.icon">{{ item.raw.name }}</v-chip>
            </template>
          </v-autocomplete>
        </v-col>
        <v-col cols="12" md="4" class="d-flex justify-md-end">
          <v-switch v-model="diffOnly" label="แสดงเฉพาะสิทธิ์ที่ต่างกัน" color="primary" hide-details :disabled="columns.length < 2" />
        </v-col>
      </v-row>
    </div>
    <v-divider />

    <FoxEmptyState
      v-if="!columns.length"
      icon="tabler:columns"
      title="เลือก Role อย่างน้อย 1 รายการ"
      text="เลือกได้หลาย Role เพื่อดูสิทธิ์เทียบกัน"
    />
    <FoxEmptyState v-else-if="!groups.length" icon="tabler:equal" title="สิทธิ์เหมือนกันทุกข้อ" text="Role ที่เลือกมีสิทธิ์ตรงกันทั้งหมด" />
    <v-table v-else fixed-header height="calc(100vh - 320px)" class="role-compare">
      <thead>
        <tr>
          <th class="role-compare__name">สิทธิ์</th>
          <th v-for="r in columns" :key="r.id" class="text-center">
            <v-btn variant="text" size="small" :color="r.tone" :prepend-icon="r.icon" :title="`เปิด Role ${r.name}`" @click="emit('open', r.id)">
              {{ r.name }}
            </v-btn>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="g in groups" :key="g.module">
          <tr class="role-compare__group" @click="toggleGroup(g.module)">
            <td class="role-compare__name">
              <div class="d-flex align-center ga-2 text-subtitle-2">
                <v-icon :icon="collapsed.has(g.module) ? 'tabler:chevron-right' : 'tabler:chevron-down'" size="16" />
                <v-icon :icon="g.icon" size="18" color="primary" />{{ g.module }}
              </div>
            </td>
            <td v-for="r in columns" :key="r.id" class="text-center text-caption fox-num text-muted">{{ countIn(r, g) }}/{{ g.items.length }}</td>
          </tr>
          <template v-if="!collapsed.has(g.module)">
            <tr v-for="item in rowsOf(g)" :key="item.key">
              <td class="role-compare__name">
                <div class="py-2">
                  <div class="text-body-2">{{ item.label }}</div>
                  <div class="text-caption text-muted">{{ item.description }}</div>
                </div>
              </td>
              <td v-for="r in columns" :key="r.id" class="text-center">
                <v-icon
                  :icon="granted(r, item.key) ? 'tabler:circle-check' : 'tabler:minus'"
                  :color="granted(r, item.key) ? r.tone : undefined"
                  :class="{ 'text-muted': !granted(r, item.key) }"
                />
                <!-- icons are aria-hidden: the answer for screen readers -->
                <span class="d-sr-only">{{ item.label }} · {{ r.name }}: {{ granted(r, item.key) ? 'มีสิทธิ์' : 'ไม่มีสิทธิ์' }}</span>
              </td>
            </tr>
          </template>
        </template>
      </tbody>
    </v-table>
  </v-card>
</template>

<style scoped>
/* first column stays while the roles scroll sideways */
.role-compare__name {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 260px;
  background: rgb(var(--v-theme-surface));
}

.role-compare thead .role-compare__name {
  z-index: 3;
}

.role-compare__group {
  cursor: pointer;
}

.role-compare__group td {
  background: rgba(var(--v-theme-primary), 0.04);
}

.role-compare__group .role-compare__name {
  background: linear-gradient(rgba(var(--v-theme-primary), 0.04), rgba(var(--v-theme-primary), 0.04)), rgb(var(--v-theme-surface));
}
</style>
