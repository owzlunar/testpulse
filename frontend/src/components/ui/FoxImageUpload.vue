<script setup lang="ts">
import { ref } from 'vue'
import { compressImage, imagesFromClipboard } from '@/utils/image'

// Thumbnail grid + upload / paste screenshot / URL + lightbox. v-model = list of image URLs (or data URLs).
// Paste works while the drop zone has focus (click it, then Ctrl/Cmd+V).
const images = defineModel<string[]>({ default: () => [] })
withDefaults(defineProps<{ readonly?: boolean }>(), { readonly: false })

const fileInput = ref<HTMLInputElement>()
const urlMenu = ref(false)
const url = ref('')
const preview = ref<string | null>(null)
const processing = ref(false)
const dragging = ref(false)

async function addFiles(files: File[]) {
  const imgs = files.filter((f) => f.type.startsWith('image/'))
  if (!imgs.length) return
  processing.value = true
  try {
    images.value = [...images.value, ...(await Promise.all(imgs.map((f) => compressImage(f))))]
  } finally {
    processing.value = false
  }
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  addFiles([...(input.files ?? [])]).then(() => (input.value = ''))
}

function onPaste(e: ClipboardEvent) {
  const files = imagesFromClipboard(e)
  if (files.length) {
    e.preventDefault()
    addFiles(files)
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false
  addFiles([...(e.dataTransfer?.files ?? [])])
}

function addUrl() {
  const value = url.value.trim()
  if (!value) return
  images.value = [...images.value, value]
  url.value = ''
  urlMenu.value = false
}

function remove(index: number) {
  images.value = images.value.filter((_, i) => i !== index)
}
</script>

<template>
  <div>
    <div v-if="images.length" class="fox-upload__grid mb-3">
      <div v-for="(img, i) in images" :key="i" class="fox-upload__thumb">
        <v-img :src="img" cover class="fill-height" role="button" :alt="`รูปที่ ${i + 1}`" @click="preview = img" />
        <v-btn
          v-if="!readonly"
          icon="tabler:x"
          size="x-small"
          color="error"
          variant="flat"
          class="fox-upload__remove"
          aria-label="ลบรูปภาพ"
          @click="remove(i)"
        />
      </div>
    </div>
    <p v-else-if="readonly" class="text-body-2 text-muted mb-0">ไม่มีภาพประกอบ</p>

    <div
      v-if="!readonly"
      class="fox-upload__zone mb-2"
      :class="{ 'fox-upload__zone--active': dragging }"
      tabindex="0"
      role="button"
      aria-label="วางภาพหน้าจอ หรือลากไฟล์มาวาง"
      @paste="onPaste"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <v-progress-circular v-if="processing" indeterminate size="18" width="2" color="primary" />
      <v-icon v-else icon="tabler:clipboard-plus" size="18" />
      <span class="text-caption">คลิกที่นี่แล้วกด Ctrl/⌘ + V เพื่อวางภาพหน้าจอ หรือลากไฟล์มาวาง</span>
    </div>
    <div v-if="!readonly" class="d-flex flex-wrap ga-2">
      <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:upload" @click="fileInput?.click()">อัปโหลดภาพ</v-btn>
      <input ref="fileInput" type="file" accept="image/*" multiple class="d-none" @change="onFile" />

      <v-menu v-model="urlMenu" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props }">
          <v-btn v-bind="props" variant="outlined" size="small" prepend-icon="tabler:link">ใส่ URL</v-btn>
        </template>
        <v-card width="320" class="pa-4">
          <label class="fox-label" for="img-url">URL ของรูปภาพ</label>
          <v-text-field id="img-url" v-model="url" density="compact" placeholder="https://example.com/screenshot.png" @keydown.enter="addUrl" />
          <div class="d-flex justify-end ga-2 mt-3">
            <v-btn variant="text" size="small" @click="urlMenu = false">ยกเลิก</v-btn>
            <v-btn color="primary" size="small" :disabled="!url.trim()" @click="addUrl">เพิ่มรูป</v-btn>
          </div>
        </v-card>
      </v-menu>
    </div>

    <v-dialog :model-value="!!preview" max-width="880" @update:model-value="preview = null">
      <v-card>
        <div class="d-flex align-center justify-space-between px-5 py-3">
          <span class="text-h6">ภาพหลักฐาน</span>
          <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="preview = null" />
        </div>
        <v-img v-if="preview" :src="preview" max-height="80vh" contain />
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.fox-upload__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  gap: 8px;
}

.fox-upload__thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: var(--fox-radius-control);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  cursor: zoom-in;
}

.fox-upload__zone {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed rgba(var(--v-theme-primary), 0.4);
  border-radius: var(--fox-radius-control);
  color: rgb(var(--v-theme-muted));
  cursor: text;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.fox-upload__zone:focus-visible,
.fox-upload__zone:focus,
.fox-upload__zone--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.04);
  color: rgb(var(--v-theme-primary));
  outline: none;
}

.fox-upload__remove {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
