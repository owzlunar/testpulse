<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxTablePagination from '@/components/ui/FoxTablePagination.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useAuditStore } from '@/stores/audit.store'
import type { AuditAction } from '@/types'
import { formatDateTime } from '@/utils/date'
import { AUDIT_ACTIONS, auditActionOf } from '@/domain/audit'

const { sortedLogs } = storeToRefs(useAuditStore())

// --- filters -----------------------------------------------------------------
const search = ref('')
const action = ref<AuditAction | null>(null)
const role = ref<string | null>(null)
const from = ref('')
const to = ref('')

const filtered = computed(() => {
  const q = search.value?.trim().toLowerCase() ?? ''
  return sortedLogs.value.filter((log) => {
    const day = log.timestamp.slice(0, 10)
    return (
      (!q || `${log.targetId} ${log.targetTitle} ${log.details} ${log.userName}`.toLowerCase().includes(q)) &&
      (!action.value || log.action === action.value) &&
      (!role.value || log.userRole === role.value) &&
      (!from.value || day >= from.value) &&
      (!to.value || day <= to.value)
    )
  })
})

const isFiltering = computed(() => !!(search.value || action.value || role.value || from.value || to.value))

function resetFilters() {
  search.value = ''
  action.value = null
  role.value = null
  from.value = ''
  to.value = ''
}

const page = ref(1)
const itemsPerPage = ref(10)
watch([search, action, role, from, to], () => (page.value = 1))

const headers = [
  { title: 'เวลา', key: 'timestamp', width: 150 },
  { title: 'การกระทำ', key: 'action', width: 160 },
  { title: 'รายการ', key: 'target' },
  { title: 'ผู้ดำเนินการ', key: 'userName', width: 220 },
] as const

// roles in old seed data are free text ("QA Lead"); offer the known ones plus whatever exists
const auth = useAuthStore()
// role names at the time of each entry (roles can be renamed), plus today's roles
const roleOptions = computed(() => [...new Set([...auth.roles.map((r) => r.name), ...sortedLogs.value.map((l) => l.userRole)])])
</script>

<template>
  <FoxPageHeader sticky :breadcrumbs="[{ title: 'ผู้ดูแลระบบ' }, { title: 'Audit Logs' }]">
    <template #actions>
      <v-chip color="primary" variant="tonal" class="fox-num">ทั้งหมด {{ sortedLogs.length }} รายการ</v-chip>
    </template>
  </FoxPageHeader>

  <v-card>
    <div class="fox-card-body">
      <v-row dense class="row-gap-3 align-center">
        <v-col cols="12" md="4">
          <v-text-field
            v-model="search"
            density="compact"
            placeholder="ค้นหาข้อความ ผู้ดำเนินการ หรือรหัสเคส"
            prepend-inner-icon="tabler:search"
            aria-label="ค้นหา"
            clearable
          />
        </v-col>
        <v-col cols="6" md="2">
          <v-select
            v-model="action"
            :items="AUDIT_ACTIONS"
            item-title="label"
            item-value="value"
            density="compact"
            placeholder="ทุกการกระทำ"
            aria-label="ประเภทการกระทำ"
            clearable
          >
            <template #item="{ props: item, item: { raw } }">
              <v-list-item v-bind="item" :prepend-icon="raw.icon" :base-color="raw.tone" />
            </template>
          </v-select>
        </v-col>
        <v-col cols="6" md="2">
          <v-select v-model="role" :items="roleOptions" density="compact" placeholder="ทุก Role" aria-label="Role" clearable />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model="from" type="date" density="compact" aria-label="ตั้งแต่วันที่" />
        </v-col>
        <v-col cols="6" md="2">
          <v-text-field v-model="to" type="date" density="compact" aria-label="ถึงวันที่" />
        </v-col>
      </v-row>
    </div>

    <v-divider />

    <v-data-table v-model:page="page" v-model:items-per-page="itemsPerPage" :headers="headers" :items="filtered" item-value="id">
      <template #[`item.timestamp`]="{ item }">
        <span class="text-no-wrap fox-num">{{ formatDateTime(item.timestamp) }}</span>
      </template>
      <template #[`item.action`]="{ item }">
        <v-chip :color="auditActionOf(item.action).tone" :prepend-icon="auditActionOf(item.action).icon" size="small" variant="tonal">
          {{ auditActionOf(item.action).label }}
        </v-chip>
      </template>
      <template #[`item.target`]="{ item }">
        <div class="py-3">
          <div class="text-subtitle-2">
            <span class="text-primary fox-num mr-1">{{ item.targetId }}</span
            >{{ item.targetTitle }}
          </div>
          <div class="text-body-2 text-muted">{{ item.details }}</div>
          <div v-for="(c, i) in item.changes ?? []" :key="i" class="d-flex flex-wrap align-center ga-2 text-caption mt-1">
            <span class="text-muted">{{ c.field }}:</span>
            <span class="text-error text-decoration-line-through">{{ c.oldValue || '—' }}</span>
            <v-icon icon="tabler:arrow-right" size="12" />
            <span class="text-success">{{ c.newValue || '—' }}</span>
          </div>
        </div>
      </template>
      <template #[`item.userName`]="{ item }">
        <div class="text-subtitle-2 text-no-wrap">{{ item.userName }}</div>
        <div class="text-caption text-muted">{{ item.userRole }}</div>
      </template>
      <template #no-data>
        <FoxEmptyState icon="tabler:history" title="ไม่พบประวัติตามเงื่อนไข" text="ลองเปลี่ยนตัวกรองหรือคำค้นหา">
          <v-btn v-if="isFiltering" class="mt-3" variant="tonal" color="primary" @click="resetFilters">ล้างตัวกรอง</v-btn>
        </FoxEmptyState>
      </template>
      <template #bottom>
        <v-divider />
        <FoxTablePagination v-model:page="page" v-model:items-per-page="itemsPerPage" :total="filtered.length" class="fox-card-body py-3" />
      </template>
    </v-data-table>
  </v-card>
</template>
