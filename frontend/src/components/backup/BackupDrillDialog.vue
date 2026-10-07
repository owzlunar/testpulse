<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatBytes } from '@/domain/backup'
import type { BackupSnapshot } from '@/types'
import { formatDateTime } from '@/utils/date'

// A restore drill: pick the snapshot to restore into the scratch database (never the live one)
const open = defineModel<boolean>({ default: false })
const props = withDefaults(defineProps<{ snapshots: BackupSnapshot[]; initial?: string | null; loading?: boolean }>(), {
  initial: null,
  loading: false,
})
const emit = defineEmits<{ start: [snapshot: string] }>()

const choice = ref<string | null>(null)
watch(
  open,
  (isOpen) => {
    if (isOpen) choice.value = props.initial ?? props.snapshots[0]?.name ?? null
  },
  { immediate: true },
)

const items = computed(() =>
  props.snapshots.map((s) => ({
    value: s.name,
    title: s.name,
    subtitle: `${formatDateTime(s.createdAt)} · ${formatBytes(s.sizeBytes)} · ${[s.local && 'เครื่องนี้', s.offsite && 'off-site'].filter(Boolean).join(' + ')}`,
  })),
)
</script>

<template>
  <v-dialog v-model="open" max-width="600">
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <h2 class="text-h5">ซ้อมกู้</h2>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <v-alert type="info" variant="tonal" density="compact" icon="tabler:info-circle" class="mb-4">
          กู้ snapshot ที่เลือกลงฐานซ้อม แล้วเทียบกับฐานจริงและหาไฟล์ที่ข้อมูลอ้างถึง ระบบจริงใช้งานต่อได้ตามปกติ ไม่มีอะไรถูกแก้ไข
        </v-alert>
        <label class="fox-label" for="drill-snapshot">Snapshot</label>
        <v-select id="drill-snapshot" v-model="choice" :items="items" item-title="title" item-value="value" :disabled="!items.length">
          <template #item="{ props: item, item: { raw } }">
            <v-list-item v-bind="item" :subtitle="raw.subtitle" />
          </template>
        </v-select>
        <p v-if="!items.length" class="text-body-2 text-muted">ยังไม่มี snapshot ให้ซ้อมกู้</p>
      </v-card-text>
      <v-divider />
      <div class="d-flex justify-end ga-3 fox-card-body py-4">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:database-import" :disabled="!choice" :loading="loading" @click="choice && emit('start', choice)">
          เริ่มซ้อมกู้
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
