<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxCardHeader from '@/components/ui/FoxCardHeader.vue'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import UserAvatar from '@/components/users/UserAvatar.vue'
import DocumentTemplateForm from '@/components/documents/DocumentTemplateForm.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useSnackbar } from '@/composables/useSnackbar'
import { resetDemoData } from '@/services/storage.service'
import { useAuthStore } from '@/stores/auth.store'
import { useDocumentStore } from '@/stores/document.store'
import { useSettingsStore } from '@/stores/settings.store'

const auth = useAuthStore()
const { currentUser, users } = storeToRefs(auth)
const { snackbar, notify } = useSnackbar()

const settingsStore = useSettingsStore()
const { run } = useAsyncAction()
const settings = reactive({ ...settingsStore.settings })
// auto-save every change
watch(settings, () =>
  run(
    () => settingsStore.save({ ...settings }),
    () => notify('บันทึกการตั้งค่าแล้ว'),
  ),
)

function switchUser(id: string) {
  const user = users.value.find((u) => u.id === id)
  if (!user) return
  run(() => auth.switchUser(user))
}

const documentStore = useDocumentStore()
// the UAT document template is part of creating documents
const canEditTemplate = computed(() => auth.can('document.create'))
if (canEditTemplate.value) run(() => documentStore.ensureLoaded())

const confirmReset = ref(false)
function reset() {
  resetDemoData()
  window.location.reload()
}
</script>

<template>
  <FoxPageHeader title="ตั้งค่า" :breadcrumbs="[{ title: 'ตั้งค่า' }]" />

  <v-row class="fox-grid">
    <v-col cols="12" md="6">
      <div class="fox-stack">
        <!-- each section shows only for roles that use it -->
        <v-card v-if="auth.can('notification.receive')" class="fox-card-body">
          <FoxCardHeader title="การแจ้งเตือน" subtitle="เลือกเหตุการณ์ที่ต้องการรับแจ้งเตือน" />
          <div class="d-flex flex-column ga-1 mt-4">
            <v-switch v-model="settings.alertOnModification" label="เมื่อ Test Case ถูกแก้ไขหรือเพิ่มใหม่" />
            <v-switch v-model="settings.alertOnStatusChange" label="เมื่อสถานะเปลี่ยน (Passed, Failed, Blocked)" />
            <v-switch v-model="settings.alertOnExpiry" color="error" label="เมื่อ Test Case ใกล้ครบกำหนดหรือเลยกำหนด" />
          </div>
          <div v-if="settings.alertOnExpiry" class="mt-4">
            <label class="fox-label">เตือนล่วงหน้า {{ settings.expiryDaysThreshold }} วัน</label>
            <v-slider v-model="settings.expiryDaysThreshold" :min="1" :max="14" :step="1" thumb-label aria-label="จำนวนวันที่เตือนล่วงหน้า" />
          </div>
        </v-card>

        <v-card class="fox-card-body">
          <FoxCardHeader title="การแสดงผล" subtitle="การจัดวางหน้าจอ" />
          <div class="mt-4">
            <v-switch v-model="settings.stickyPageHeader" label="ตรึงหัวหน้าเพจไว้ด้านบนเมื่อเลื่อนหน้าจอ" hide-details />
            <p class="text-caption text-muted">
              ใช้กับหน้าที่ยาว (Test Cases, Requirements, Defects, Audit Logs) หัวข้อและปุ่มจะย่อลงเมื่อเกาะด้านบน ทำงานบนจอกว้างตั้งแต่ 960px
            </p>
          </div>
        </v-card>

        <v-card v-if="auth.can('case.view')" class="fox-card-body">
          <FoxCardHeader title="ส่งออก Obsidian (.md)" subtitle="รูปแบบไฟล์ Markdown ที่ส่งออก" />
          <div class="d-flex flex-column mt-4">
            <v-checkbox v-model="settings.obsidianFrontmatter" label="ใส่ YAML Frontmatter (tags, metadata, สถิติ)" />
            <v-checkbox v-model="settings.obsidianCallouts" label="ใช้ Obsidian Callouts (> [!NOTE], > [!TIP])" />
            <v-checkbox v-model="settings.obsidianWikilinks" label="สร้าง Wikilinks ([[Sub-case]], [[Project]])" />
          </div>
        </v-card>
      </div>
    </v-col>

    <v-col cols="12" md="6">
      <div class="fox-stack">
        <v-card class="fox-card-body">
          <FoxCardHeader title="บัญชีผู้ทดสอบ" subtitle="สลับ Mock User เพื่อทดลองแต่ละ Role" />
          <div class="d-flex align-center ga-4 my-5">
            <UserAvatar :user="currentUser" size="56" />
            <div class="overflow-hidden">
              <div class="text-h6 text-truncate">{{ currentUser.name }}</div>
              <div class="text-body-2 text-muted text-truncate">{{ currentUser.email }}</div>
              <v-chip :color="auth.roleOf(currentUser).tone" size="x-small" variant="tonal" class="mt-1">{{ auth.roleOf(currentUser).label }}</v-chip>
            </div>
          </div>
          <label class="fox-label" for="set-user">สลับผู้ใช้งาน</label>
          <v-select
            id="set-user"
            :model-value="currentUser.id"
            :items="users.map((u) => ({ title: `${u.name} · ${auth.roleOf(u).label}`, value: u.id }))"
            @update:model-value="switchUser"
          />
        </v-card>

        <v-card v-if="auth.isAdmin" color="light-warning" variant="flat" class="fox-card-body">
          <div class="d-flex align-start ga-4">
            <v-avatar color="warning" variant="flat" size="44"><v-icon icon="tabler:database" size="22" /></v-avatar>
            <div>
              <div class="text-h6">รีเซ็ตข้อมูลตัวอย่าง</div>
              <p class="text-body-2 text-muted mb-4">คืนค่าโปรเจกต์ Test Case, Audit Logs และการแจ้งเตือนเป็นข้อมูลเริ่มต้น</p>
              <v-btn color="warning" variant="flat" prepend-icon="tabler:restore" @click="confirmReset = true">คืนค่าข้อมูลเริ่มต้น</v-btn>
            </div>
          </div>
        </v-card>
      </div>
    </v-col>
    <v-col v-if="canEditTemplate" cols="12">
      <DocumentTemplateForm v-if="documentStore.loaded" @saved="notify('บันทึกแม่แบบเอกสารแล้ว')" />
      <v-card v-else class="fox-card-body"><v-skeleton-loader type="heading, paragraph" /></v-card>
    </v-col>
  </v-row>

  <FoxConfirmDialog
    v-model="confirmReset"
    title="รีเซ็ตข้อมูลตัวอย่าง?"
    text="ข้อมูลที่คุณสร้างหรือแก้ไขทั้งหมดจะหายไป และหน้าจะโหลดใหม่"
    confirm-text="รีเซ็ต"
    tone="warning"
    @confirm="reset"
  />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>
