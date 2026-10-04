<script setup lang="ts">
import { downloadText, toCsv } from '@/utils/table'

// Step 1 of an import wizard: paste from Excel / Google Sheets or upload a CSV file (see useTableImport)
const source = defineModel<'paste' | 'file'>('source', { required: true })
const text = defineModel<string>('text', { required: true })
const hasHeader = defineModel<boolean>('hasHeader', { required: true })
defineProps<{
  fileName: string
  rows: number
  columns: number
  /** the downloadable example file */
  template: { name: string; rows: string[][] }
  placeholder?: string
}>()
defineEmits<{ file: [e: Event] }>()
</script>

<template>
  <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
    <v-btn-toggle v-model="source" mandatory color="primary" variant="outlined" density="comfortable">
      <v-btn value="paste" prepend-icon="tabler:clipboard-text">วางจาก Excel</v-btn>
      <v-btn value="file" prepend-icon="tabler:file-upload">อัปโหลด CSV</v-btn>
    </v-btn-toggle>
    <v-btn variant="text" color="primary" prepend-icon="tabler:download" @click="downloadText(template.name, toCsv(template.rows))">
      ดาวน์โหลดไฟล์ตัวอย่าง
    </v-btn>
  </div>

  <template v-if="source === 'paste'">
    <label class="fox-label" for="imp-paste">เลือกช่วงตารางใน Excel แล้วคัดลอก (Ctrl/⌘ + C) มาวางที่นี่</label>
    <v-textarea id="imp-paste" v-model="text" rows="8" :placeholder="placeholder" />
  </template>
  <template v-else>
    <label class="fox-label" for="imp-file">ไฟล์ CSV (UTF-8)</label>
    <v-file-input
      id="imp-file"
      accept=".csv,text/csv"
      prepend-icon=""
      prepend-inner-icon="tabler:file-spreadsheet"
      :label="fileName || 'เลือกไฟล์'"
      @change="$emit('file', $event)"
    />
    <p class="text-caption text-muted mt-2">ไฟล์ .xlsx ให้ "บันทึกเป็น CSV UTF-8" ก่อน หรือใช้วิธีคัดลอกวาง</p>
  </template>

  <v-checkbox v-model="hasHeader" label="แถวแรกเป็นหัวตาราง" class="mt-2" />
  <slot />
  <p v-if="text" class="text-body-2 text-muted mt-3 mb-0">อ่านได้ {{ rows }} แถว · {{ columns }} คอลัมน์</p>
</template>
