<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import FoxCardHeader from '@/components/ui/FoxCardHeader.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { formatDocNumber } from '@/services/document.service'
import { useDocumentStore } from '@/stores/document.store'
import type { DocumentTemplate } from '@/types'
import { compressImage } from '@/utils/image'

// Organisation branding and defaults applied to every generated document
const emit = defineEmits<{ saved: [] }>()
const store = useDocumentStore()
const { busy, run } = useAsyncAction()

const form = reactive<DocumentTemplate>(JSON.parse(JSON.stringify(store.template)))
watch(() => store.template, (t) => Object.assign(form, JSON.parse(JSON.stringify(t))))

const fileInput = ref<HTMLInputElement>()
function onLogo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) compressImage(file, 256).then((url) => (form.logo = url))
}

const sample = computed(() => formatDocNumber(form.docNumberPattern, 'uat', 'PAY', 1))

function save() {
  run(() => store.saveTemplate(JSON.parse(JSON.stringify(form))), () => emit('saved'))
}
</script>

<template>
  <v-card class="fox-card-body">
    <FoxCardHeader title="แม่แบบเอกสาร" subtitle="หัวกระดาษ เลขที่เอกสาร และผู้ลงนามเริ่มต้นของทุกเอกสารที่สร้าง">
      <v-btn color="primary" :loading="busy" @click="save">บันทึกแม่แบบ</v-btn>
    </FoxCardHeader>
    <v-row dense class="fox-form-grid mt-4">
      <v-col cols="12" md="2">
        <span class="fox-label">โลโก้</span>
        <button type="button" class="tpl-logo" aria-label="อัปโหลดโลโก้" @click="fileInput?.click()">
          <img v-if="form.logo" :src="form.logo" alt="" />
          <v-icon v-else icon="tabler:photo-plus" size="28" />
        </button>
        <input ref="fileInput" type="file" accept="image/*" class="d-none" @change="onLogo" />
        <v-btn v-if="form.logo" variant="text" size="x-small" color="error" @click="form.logo = ''">ลบ</v-btn>
      </v-col>
      <v-col cols="12" md="10">
        <v-row dense class="fox-form-grid">
          <v-col cols="12" md="6">
            <label class="fox-label" for="tpl-company">ชื่อองค์กร</label>
            <v-text-field id="tpl-company" v-model="form.companyName" />
          </v-col>
          <v-col cols="12" md="6">
            <label class="fox-label" for="tpl-pattern">รูปแบบเลขที่เอกสาร</label>
            <v-text-field id="tpl-pattern" v-model="form.docNumberPattern" :hint="`ตัวอย่าง: ${sample} · ใช้ {TYPE} {KEY} {YYYYMMDD} {YYYY} {NN}`" persistent-hint />
          </v-col>
          <v-col cols="12">
            <label class="fox-label" for="tpl-address">ที่อยู่</label>
            <v-text-field id="tpl-address" v-model="form.companyAddress" />
          </v-col>
          <v-col cols="12" md="6">
            <label class="fox-label" for="tpl-header">ข้อความใต้หัวเรื่อง</label>
            <v-text-field id="tpl-header" v-model="form.headerNote" />
          </v-col>
          <v-col cols="12" md="6">
            <label class="fox-label" for="tpl-footer">ข้อความท้ายเอกสาร</label>
            <v-text-field id="tpl-footer" v-model="form.footerNote" />
          </v-col>
        </v-row>
      </v-col>
      <v-col cols="12">
        <span class="fox-label">ผู้ลงนามเริ่มต้น</span>
        <v-row v-for="(sg, i) in form.defaultSignatories" :key="i" dense class="align-center">
          <v-col cols="6" md="5"><v-text-field v-model="sg.role" density="compact" :aria-label="`บทบาท ${i + 1}`" placeholder="บทบาท" /></v-col>
          <v-col cols="5" md="5"><v-text-field v-model="sg.position" density="compact" :aria-label="`ตำแหน่ง ${i + 1}`" placeholder="ตำแหน่ง" /></v-col>
          <v-col cols="1" md="2" class="text-end">
            <v-btn icon="tabler:trash" variant="text" size="small" color="error" :aria-label="`ลบ ${i + 1}`" @click="form.defaultSignatories.splice(i, 1)" />
          </v-col>
        </v-row>
        <v-btn class="mt-2" variant="tonal" color="primary" size="small" prepend-icon="tabler:plus" @click="form.defaultSignatories.push({ role: '', position: '' })">เพิ่มผู้ลงนาม</v-btn>
      </v-col>
    </v-row>
  </v-card>
</template>

<style scoped>
.tpl-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border: 1px dashed rgba(var(--v-theme-primary), 0.4);
  border-radius: var(--fox-radius-control);
  color: rgb(var(--v-theme-muted));
}

.tpl-logo img {
  max-width: 88px;
  max-height: 88px;
  object-fit: contain;
}
</style>
