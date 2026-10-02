<script setup lang="ts">
import { computed } from 'vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { useAuditStore } from '@/stores/audit.store'
import { formatDateTime } from '@/utils/date'
import { auditActionOf } from '@/domain/audit'

// Audit trail entries of one test case
const props = defineProps<{ caseId: string; projectId: string }>()
const audit = useAuditStore()
const logs = computed(() => audit.logsFor(props.caseId, props.projectId))
</script>

<template>
  <div v-if="logs.length" class="d-flex flex-column ga-3">
    <div v-for="log in logs" :key="log.id" class="d-flex ga-3">
      <v-avatar :color="auditActionOf(log.action).tone" size="32">
        <v-icon :icon="auditActionOf(log.action).icon" size="16" />
      </v-avatar>
      <div class="flex-grow-1 overflow-hidden">
        <div class="d-flex justify-space-between ga-2">
          <span class="text-subtitle-2">{{ auditActionOf(log.action).label }}</span>
          <span class="text-caption text-muted text-no-wrap">{{ formatDateTime(log.timestamp) }}</span>
        </div>
        <div class="text-body-2">{{ log.details }}</div>
        <div class="text-caption text-muted">โดย {{ log.userName }} ({{ log.userRole }})</div>
      </div>
    </div>
  </div>
  <FoxEmptyState v-else icon="tabler:history" title="ยังไม่มีบันทึก Audit ของเคสนี้" />
</template>
