<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import DocumentWizardDialog from '@/components/documents/DocumentWizardDialog.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, documentStatusOf, documentTypeOf } from '@/services/document.service'
import { useAuthStore } from '@/stores/auth.store'
import { useDocumentStore } from '@/stores/document.store'
import type { DocumentRecord, DocumentStatus, DocumentType } from '@/types'
import { formatRelative } from '@/utils/date'

const auth = useAuthStore()

const route = useRoute()
const router = useRouter()
const store = useDocumentStore()
const { current, loaded } = storeToRefs(store)
const { snackbar, notify } = useSnackbar()
const { run } = useAsyncAction()

onMounted(() => run(() => store.ensureLoaded()))

const type = ref<DocumentType | null>(null)
const status = ref<DocumentStatus | null>(null)
const filtered = computed(() => current.value.filter((d) => (!type.value || d.type === type.value) && (!status.value || d.status === status.value)))
const signedCount = (d: DocumentRecord) => d.signatories.filter((s) => s.status === 'signed').length

// --- create ---------------------------------------------------------------------------
const wizard = ref(false)
const wizardType = ref<DocumentType | null>(null)
const wizardRun = ref<string | null>(null)

function create(t: DocumentType | null = null, runId: string | null = null) {
  wizardType.value = t
  wizardRun.value = runId
  wizard.value = true
}

function onGenerated(doc: DocumentRecord) {
  router.push(`/documents/${doc.id}`)
}

// links from other pages: /documents?create=uat&runId=run-1
watch(
  () => route.query.create,
  (t) => {
    if (typeof t !== 'string' || !DOCUMENT_TYPES.some((x) => x.value === t) || !auth.can('document.create')) return
    create(t as DocumentType, typeof route.query.runId === 'string' ? route.query.runId : null)
    router.replace({ query: {} })
  },
  { immediate: true },
)

// --- delete -----------------------------------------------------------------------------
const confirmOpen = ref(false)
const deleting = ref<DocumentRecord | null>(null)
function askDelete(d: DocumentRecord) {
  deleting.value = d
  confirmOpen.value = true
}
function onDelete() {
  const d = deleting.value
  if (d) run(() => store.remove(d.id), () => notify(`ลบ ${d.docNumber} แล้ว`))
}
</script>

<template>
  <FoxPageHeader title="ศูนย์เอกสาร" :breadcrumbs="[{ title: 'เอกสาร' }]">
    <template #actions>
      <v-btn v-if="auth.can('document.create')" color="primary" prepend-icon="tabler:file-plus" @click="create()">สร้างเอกสาร</v-btn>
    </template>
  </FoxPageHeader>

  <FoxPageSkeleton v-if="!loaded" :stats="4" :rows="1" />
  <div v-else class="fox-stack">
    <!-- one-click create -->
    <v-row v-if="auth.can('document.create')" class="fox-grid">
      <v-col v-for="t in DOCUMENT_TYPES" :key="t.value" cols="12" sm="6" lg="3">
        <v-card class="fox-card-body h-100 doc-quick" @click="create(t.value)">
          <div class="d-flex align-center ga-3 mb-3">
            <v-avatar :color="t.tone" rounded="lg" size="48"><v-icon :icon="t.icon" size="24" /></v-avatar>
            <div>
              <div class="text-h6">{{ t.label }}</div>
              <div class="text-caption text-muted">{{ t.hint }}</div>
            </div>
          </div>
          <p class="text-body-2 text-muted fox-clamp-2 mb-3">{{ t.description }}</p>
          <div class="d-flex align-center justify-space-between">
            <span class="text-caption text-muted fox-num">{{ current.filter((d) => d.type === t.value).length }} ฉบับ</span>
            <v-btn variant="text" color="primary" size="small" append-icon="tabler:arrow-right">สร้าง</v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-card>
      <div class="fox-card-body d-flex flex-wrap align-center justify-space-between ga-3">
        <h2 class="text-h5">เอกสารทั้งหมด</h2>
        <div class="d-flex flex-wrap ga-2 doc-filters">
          <v-select v-model="type" :items="DOCUMENT_TYPES" item-title="label" item-value="value" density="compact" placeholder="ทุกประเภท" aria-label="ประเภท" clearable />
          <v-select v-model="status" :items="DOCUMENT_STATUSES" item-title="label" item-value="value" density="compact" placeholder="ทุกสถานะ" aria-label="สถานะ" clearable />
        </div>
      </div>
      <v-divider />
      <v-table v-if="filtered.length">
        <thead>
          <tr>
            <th>เอกสาร</th>
            <th>สถานะ</th>
            <th class="text-center">ลงนาม</th>
            <th>อัปเดต</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in filtered" :key="d.id" class="doc-row" @click="router.push(`/documents/${d.id}`)">
            <td>
              <div class="d-flex align-center ga-3 py-2">
                <v-avatar :color="documentTypeOf(d.type).tone" rounded="lg" size="40"><v-icon :icon="documentTypeOf(d.type).icon" size="20" /></v-avatar>
                <div class="overflow-hidden">
                  <div class="text-subtitle-2 text-truncate">{{ d.title }}</div>
                  <div class="text-caption text-muted fox-num">{{ d.docNumber }} · v{{ d.version }}.0 · {{ documentTypeOf(d.type).label }}</div>
                </div>
              </div>
            </td>
            <td>
              <v-chip :color="documentStatusOf(d.status).tone" :prepend-icon="documentStatusOf(d.status).icon" size="small" variant="tonal">{{ documentStatusOf(d.status).label }}</v-chip>
            </td>
            <td class="text-center fox-num">{{ signedCount(d) }}/{{ d.signatories.length }}</td>
            <td class="text-caption text-muted text-no-wrap">{{ formatRelative(d.updatedAt) }}</td>
            <td class="text-end" @click.stop>
              <v-btn icon="tabler:eye" variant="text" size="small" color="primary" :to="`/documents/${d.id}`" :aria-label="`เปิด ${d.docNumber}`" />
              <v-btn
                v-if="d.status !== 'signed'"
                icon="tabler:trash"
                variant="text"
                size="small"
                color="error"
                :aria-label="`ลบ ${d.docNumber}`"
                @click="askDelete(d)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
      <FoxEmptyState
        v-else
        icon="tabler:files"
        title="ยังไม่มีเอกสาร"
        text="เลือกประเภทเอกสารด้านบน ระบบจะดึง Test Case ผลทดสอบ และ Defect มาจัดรูปแบบให้"
      />
    </v-card>
  </div>

  <DocumentWizardDialog v-model="wizard" :type="wizardType" :run-id="wizardRun" @generated="onGenerated" />
  <FoxConfirmDialog v-model="confirmOpen" title="ลบเอกสาร?" :text="deleting ? `${deleting.docNumber} จะถูกลบถาวร` : ''" confirm-text="ลบ" @confirm="onDelete" />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.doc-quick {
  cursor: pointer;
  transition: transform 0.15s;
}

.doc-quick:hover {
  transform: translateY(-2px);
}

.doc-row {
  cursor: pointer;
}

.doc-filters > * {
  width: 200px;
}

@media (max-width: 599.98px) {
  .doc-filters,
  .doc-filters > * {
    width: 100%;
  }
}
</style>
