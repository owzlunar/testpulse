<script setup lang="ts" generic="K extends string">
import type { ImportField } from '@/composables/useTableImport'

// Step 2 of an import wizard: which column fills which field (matched from the header, editable)
const mapping = defineModel<Record<K, number | null>>({ required: true })
defineProps<{
  fields: ImportField<K>[]
  columns: { title: string; value: number }[]
  sample: (field: K) => string
}>()
</script>

<template>
  <p class="text-body-2 text-muted mb-4">ระบบจับคู่คอลัมน์ให้อัตโนมัติจากชื่อหัวตาราง ตรวจสอบและแก้ไขได้</p>
  <v-table>
    <thead>
      <tr>
        <th>ข้อมูลใน TestPulse</th>
        <th>คอลัมน์จากไฟล์</th>
        <th>ตัวอย่างข้อมูล</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="f in fields" :key="f.key">
        <td class="text-subtitle-2 text-no-wrap">{{ f.label }}<span v-if="f.required" class="text-error"> *</span></td>
        <td class="imp-map">
          <v-select v-model="mapping[f.key]" :items="columns" density="compact" placeholder="— ไม่นำเข้า —" clearable :aria-label="f.label" />
        </td>
        <td class="text-body-2 text-muted">
          <span class="fox-clamp-2">{{ sample(f.key) || '—' }}</span>
        </td>
      </tr>
    </tbody>
  </v-table>
</template>

<style scoped>
.imp-map {
  min-width: 220px;
}
</style>
