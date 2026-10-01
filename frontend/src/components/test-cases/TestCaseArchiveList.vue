<script setup lang="ts">
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import type { TestCase } from '@/types'
import { formatDateTime } from '@/utils/date'

// Archived cases of a project: view (read-only), restore, delete permanently
defineProps<{ archived: TestCase[] }>()
const emit = defineEmits<{ edit: [tc: TestCase]; restore: [tc: TestCase]; purge: [tc: TestCase] }>()
const { canArchive, canPurge } = useTestCasePermissions()
</script>

<template>
  <v-card>
    <FoxEmptyState v-if="!archived.length" icon="tabler:archive" title="คลังเก็บว่าง" text="เคสที่เก็บเข้าคลังจะแสดงที่นี่" />
    <div v-else class="d-flex flex-column">
      <template v-for="(tc, i) in archived" :key="tc.id">
        <v-divider v-if="i" />
        <div class="d-flex flex-wrap align-center ga-3 fox-card-body py-4">
          <v-icon icon="tabler:archive" class="text-muted" />
          <div class="flex-grow-1 overflow-hidden">
            <div class="text-subtitle-2 text-truncate">
              <span class="text-primary fox-num mr-2">{{ tc.id }}</span
              >{{ tc.name }}
            </div>
            <div class="text-caption text-muted">
              <template v-if="tc.parentId">Sub-case ของ {{ tc.parentId }} · </template>
              {{ tc.version }} · เก็บเมื่อ {{ formatDateTime(tc.archivedAt!) }}<template v-if="tc.archivedBy"> โดย {{ tc.archivedBy }}</template>
            </div>
          </div>
          <div class="d-flex align-center ga-1 flex-shrink-0">
            <v-btn icon="tabler:eye" variant="text" size="small" :aria-label="`ดู ${tc.id}`" @click="emit('edit', tc)" />
            <v-btn v-if="canArchive" variant="tonal" color="primary" size="small" prepend-icon="tabler:archive-off" @click="emit('restore', tc)"
              >กู้คืน</v-btn
            >
            <v-btn
              v-if="canPurge"
              icon="tabler:trash"
              variant="text"
              size="small"
              color="error"
              :aria-label="`ลบถาวร ${tc.id}`"
              @click="emit('purge', tc)"
            />
          </div>
        </div>
      </template>
    </div>
  </v-card>
</template>
