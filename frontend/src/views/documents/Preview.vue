<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import DocumentPaper from '@/components/documents/DocumentPaper.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { documentStatusOf, documentTypeOf, uatDecisionOf } from '@/services/document.service'
import { downloadWordDocument } from '@/services/export.service'
import { useAuthStore } from '@/stores/auth.store'
import { useDocumentStore } from '@/stores/document.store'
import { useProjectStore } from '@/stores/project.store'
import { formatDateTime, formatRelative } from '@/utils/date'

const auth = useAuthStore()

const route = useRoute()
const store = useDocumentStore()
const { loaded, template } = storeToRefs(store)
const { currentCases } = storeToRefs(useProjectStore())
const { snackbar, notify } = useSnackbar()
const { busy, run } = useAsyncAction()

onMounted(() => run(() => store.ensureLoaded()))

const doc = computed(() => store.getById(String(route.params.id)))
const locked = computed(() => doc.value?.status === 'signed' || doc.value?.status === 'pending_signoff')

/** cases edited after the snapshot was taken -> suggest a new version */
const staleCount = computed(() => {
  const at = doc.value?.snapshot.generatedAt
  return at ? currentCases.value.filter((c) => c.updatedAt > at).length : 0
})

function print() {
  window.print()
}

function downloadWord() {
  const d = doc.value
  const el = document.querySelector<HTMLElement>('.doc-sheet')
  if (!d || !el) return
  downloadWordDocument(`${d.docNumber}_v${d.version}`, el, d.title)
  notify(`ดาวน์โหลด ${d.docNumber}.doc แล้ว`)
}

const confirmRegen = ref(false)
function regenerate() {
  const d = doc.value
  if (d)
    run(
      () => store.regenerate(d.id),
      (updated) => notify(`สร้างเวอร์ชัน ${updated.version}.0 จากข้อมูลล่าสุดแล้ว`),
    )
}

function requestSignoff() {
  const d = doc.value
  if (d)
    run(
      () => store.requestSignoff(d.id),
      () => notify('ส่งขอลงนามแล้ว'),
    )
}

// mock sign-off: in production each signer receives a link and signs as themselves
const signDialog = ref(false)
const signIndex = ref(0)
const signDecision = ref<'signed' | 'rejected'>('signed')
const signComment = ref('')
function openSign(i: number, decision: 'signed' | 'rejected') {
  signIndex.value = i
  signDecision.value = decision
  signComment.value = ''
  signDialog.value = true
}
function confirmSign() {
  const d = doc.value
  if (!d) return
  run(
    () => store.sign(d.id, signIndex.value, signDecision.value, signComment.value),
    () => {
      signDialog.value = false
      notify(signDecision.value === 'signed' ? 'ลงนามแล้ว' : 'บันทึกการปฏิเสธแล้ว', signDecision.value === 'signed' ? 'success' : 'error')
    },
  )
}
</script>

<template>
  <FoxPageSkeleton v-if="!loaded" :stats="0" :rows="2" />
  <v-card v-else-if="!doc">
    <FoxEmptyState icon="tabler:file-unknown" title="ไม่พบเอกสาร" text="อาจถูกลบไปแล้ว">
      <v-btn class="mt-3" color="primary" to="/documents">กลับไปศูนย์เอกสาร</v-btn>
    </FoxEmptyState>
  </v-card>

  <template v-else>
    <FoxPageHeader
      class="no-print"
      :title="doc.docNumber"
      :breadcrumbs="[{ title: 'เอกสาร', to: '/documents' }, { title: documentTypeOf(doc.type).label }]"
    >
      <template #actions>
        <v-btn variant="outlined" prepend-icon="tabler:printer" @click="print">พิมพ์ / PDF</v-btn>
        <v-btn variant="outlined" prepend-icon="tabler:file-type-doc" @click="downloadWord">ดาวน์โหลด Word</v-btn>
        <v-btn
          v-if="doc.status === 'draft' && doc.signatories.length && auth.can('document.create')"
          color="primary"
          prepend-icon="tabler:signature"
          :loading="busy"
          @click="requestSignoff"
          >ส่งขอลงนาม</v-btn
        >
      </template>
    </FoxPageHeader>

    <v-row class="fox-grid">
      <v-col cols="12" lg="9">
        <DocumentPaper :doc="doc" :template="template" />
      </v-col>

      <v-col cols="12" lg="3" class="no-print">
        <div class="fox-stack doc-side">
          <v-card class="fox-card-body">
            <div class="text-overline text-muted">สถานะ</div>
            <v-chip :color="documentStatusOf(doc.status).tone" :prepend-icon="documentStatusOf(doc.status).icon" variant="flat" class="mb-4">
              {{ documentStatusOf(doc.status).label }}
            </v-chip>
            <dl class="doc-facts text-body-2">
              <dt>เวอร์ชัน</dt>
              <dd class="fox-num">{{ doc.version }}.0</dd>
              <dt>ข้อมูล ณ</dt>
              <dd>{{ formatDateTime(doc.snapshot.generatedAt) }}</dd>
              <dt>จัดทำโดย</dt>
              <dd>{{ doc.createdBy }}</dd>
              <dt>Test Cases</dt>
              <dd class="fox-num">{{ doc.snapshot.summary.total }}</dd>
              <template v-if="doc.uat"
                ><dt>มติ</dt>
                <dd :class="`text-${uatDecisionOf(doc.uat.decision).tone}`">{{ uatDecisionOf(doc.uat.decision).label }}</dd></template
              >
            </dl>
            <v-alert v-if="staleCount && doc.status !== 'signed'" type="info" variant="tonal" density="compact" icon="tabler:refresh" class="mt-4">
              มี {{ staleCount }} เคสที่แก้ไขหลังสร้างเอกสาร
            </v-alert>
            <v-btn
              v-if="doc.status !== 'signed'"
              block
              variant="tonal"
              color="primary"
              prepend-icon="tabler:refresh"
              class="mt-4"
              :loading="busy"
              @click="locked ? (confirmRegen = true) : regenerate()"
            >
              สร้างเวอร์ชันใหม่จากข้อมูลล่าสุด
            </v-btn>
          </v-card>

          <v-card class="fox-card-body">
            <div class="d-flex align-center justify-space-between mb-3">
              <span class="text-overline text-muted">ผู้ลงนาม</span>
              <span class="text-caption text-muted fox-num"
                >{{ doc.signatories.filter((s) => s.status === 'signed').length }}/{{ doc.signatories.length }}</span
              >
            </div>
            <div class="d-flex flex-column ga-4">
              <div v-for="(sg, i) in doc.signatories" :key="i">
                <div class="d-flex align-start ga-3">
                  <v-avatar :color="sg.status === 'signed' ? 'success' : sg.status === 'rejected' ? 'error' : 'secondary'" size="32">
                    <v-icon :icon="sg.status === 'signed' ? 'tabler:check' : sg.status === 'rejected' ? 'tabler:x' : 'tabler:clock'" size="16" />
                  </v-avatar>
                  <div class="overflow-hidden flex-grow-1">
                    <div class="text-subtitle-2 text-truncate">{{ sg.name || 'ยังไม่ระบุชื่อ' }}</div>
                    <div class="text-caption text-muted">{{ sg.role }} · {{ sg.position }}</div>
                    <div v-if="sg.signedAt" class="text-caption text-muted">{{ formatRelative(sg.signedAt) }}</div>
                  </div>
                </div>
                <div v-if="doc.status === 'pending_signoff' && sg.status === 'pending' && auth.can('document.sign')" class="d-flex ga-2 mt-2 ml-11">
                  <v-btn size="small" color="success" variant="tonal" prepend-icon="tabler:signature" @click="openSign(i, 'signed')">ลงนาม</v-btn>
                  <v-btn size="small" color="error" variant="text" @click="openSign(i, 'rejected')">ปฏิเสธ</v-btn>
                </div>
              </div>
              <div v-if="!doc.signatories.length" class="text-body-2 text-muted">ไม่มีผู้ลงนาม</div>
            </div>
            <p v-if="doc.status === 'draft' && doc.signatories.length" class="text-caption text-muted mt-4 mb-0">ตรวจทานเอกสารแล้วกด "ส่งขอลงนาม"</p>
            <p v-if="doc.status === 'pending_signoff'" class="text-caption text-muted mt-4 mb-0">
              ระบบจริงจะส่งลิงก์ให้ผู้ลงนามแต่ละคน ในโหมดจำลองกดลงนามแทนได้จากที่นี่
            </p>
          </v-card>
        </div>
      </v-col>
    </v-row>

    <v-dialog v-model="signDialog" max-width="460">
      <v-card class="fox-card-body">
        <h2 class="text-h5 mb-1">{{ signDecision === 'signed' ? 'ยืนยันการลงนาม' : 'ปฏิเสธเอกสาร' }}</h2>
        <p class="text-body-2 text-muted">
          {{ doc.signatories[signIndex]?.name || doc.signatories[signIndex]?.role }} · {{ doc.docNumber }} v{{ doc.version }}.0
        </p>
        <label class="fox-label mt-4" for="sign-comment">{{ signDecision === 'signed' ? 'หมายเหตุ (ถ้ามี)' : 'เหตุผลที่ปฏิเสธ *' }}</label>
        <v-textarea id="sign-comment" v-model="signComment" rows="2" auto-grow />
        <div class="d-flex justify-end ga-3 mt-6">
          <v-btn variant="outlined" @click="signDialog = false">ยกเลิก</v-btn>
          <v-btn
            :color="signDecision === 'signed' ? 'success' : 'error'"
            :loading="busy"
            :disabled="signDecision === 'rejected' && !signComment.trim()"
            @click="confirmSign"
          >
            {{ signDecision === 'signed' ? 'ลงนาม' : 'ปฏิเสธ' }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <FoxConfirmDialog
      v-model="confirmRegen"
      title="สร้างเวอร์ชันใหม่?"
      text="เอกสารอยู่ระหว่างลงนาม การสร้างเวอร์ชันใหม่จะล้างลายเซ็นทั้งหมดและกลับเป็นฉบับร่าง"
      confirm-text="สร้างเวอร์ชันใหม่"
      tone="warning"
      @confirm="regenerate"
    />
  </template>
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.doc-side {
  position: sticky;
  top: 88px;
}

.doc-facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 12px;
  margin: 0;
}

.doc-facts dt {
  color: rgb(var(--v-theme-muted));
}

.doc-facts dd {
  margin: 0;
}

@media (max-width: 1279.98px) {
  .doc-side {
    position: static;
  }
}
</style>
