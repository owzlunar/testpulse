<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import type { VForm } from 'vuetify/components'
import ProjectAvatar from './ProjectAvatar.vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth.store'
import type { Project, ProjectInput, ProjectMilestone } from '@/types'
import { newId } from '@/utils/ids'
import { addDays, todayISO } from '@/utils/date'
import { fileApi } from '@/api'
import { errorMessage } from '@/api/errors'
import { required } from '@/utils/validators'
import {
  ENVIRONMENT_NAME_MAX,
  MILESTONE_TYPES,
  PROJECT_KEY_MAX,
  PROJECT_KEY_MIN,
  PROJECT_STATUSES,
  defaultEnvironments,
  environmentsProblem,
  isProjectKey,
} from '@/domain/project'

const open = defineModel<boolean>({ default: false })
const props = withDefaults(defineProps<{ project?: Project | null; loading?: boolean }>(), { project: null, loading: false })
const emit = defineEmits<{ save: [input: ProjectInput] }>()

const { teams } = storeToRefs(useAuthStore())

const formRef = ref<VForm>()
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
const logoError = ref('')
const uploadingLogo = ref(false)

const empty = (): ProjectInput => ({
  key: '',
  name: '',
  description: '',
  logo: '',
  targetDeadline: addDays(todayISO(), 14),
  status: 'active',
  tags: [],
  milestones: [],
  teamIds: [],
  environments: defaultEnvironments(),
})
const form = reactive<ProjectInput>(empty())
const isEdit = computed(() => !!form.id)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    logoError.value = ''
    const p = props.project
    Object.assign(
      form,
      empty(),
      p
        ? {
            ...p,
            tags: [...p.tags],
            milestones: (p.milestones ?? []).map((m) => ({ ...m })),
            environments: (p.environments?.length ? p.environments : defaultEnvironments()).map((e) => ({ ...e })),
          }
        : { id: undefined },
    )
  },
  { immediate: true },
)
useUnsavedChanges(open, () => form)

const rules = {
  required,
  key: (v: string) => isProjectKey(v) || `ตัวพิมพ์ใหญ่ A-Z หรือตัวเลข ${PROJECT_KEY_MIN}–${PROJECT_KEY_MAX} ตัว`,
}

// --- logo upload ---------------------------------------------------------------
function readLogo(file?: File | null) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    logoError.value = 'กรุณาเลือกไฟล์รูปภาพ'
    return
  }
  logoError.value = ''
  uploadingLogo.value = true
  fileApi
    .upload(file, 'project-logo')
    .then((uploaded) => (form.logo = uploaded.url))
    .catch((e: unknown) => (logoError.value = errorMessage(e)))
    .finally(() => (uploadingLogo.value = false))
}

function onDrop(e: DragEvent) {
  dragging.value = false
  readLogo(e.dataTransfer?.files?.[0])
}

// --- milestones ---------------------------------------------------------------
function addMilestone() {
  const used = new Set(form.milestones?.map((m) => m.type))
  const type = MILESTONE_TYPES.find((t) => !used.has(t.value)) ?? MILESTONE_TYPES[0]
  const m: ProjectMilestone = { id: `m-${Date.now()}`, title: type.label, date: form.targetDeadline || todayISO(), type: type.value }
  form.milestones = [...(form.milestones ?? []), m]
}

function removeMilestone(id: string) {
  form.milestones = form.milestones?.filter((m) => m.id !== id)
}

// --- environments: TEST (primary, the company's test server), STAGING (the customer's) … ------------
function addEnvironment() {
  const used = new Set(form.environments.map((e) => e.name.toUpperCase()))
  const name = ['STAGING', 'UAT', 'SIT', 'PRE-PROD'].find((n) => !used.has(n)) ?? ''
  form.environments = [...form.environments, { id: newId('env'), name, primary: false }]
}

function removeEnvironment(id: string) {
  form.environments = form.environments.filter((e) => e.id !== id)
  if (!form.environments.some((e) => e.primary) && form.environments[0]) form.environments[0].primary = true
}

function makePrimary(id: string) {
  form.environments.forEach((e) => (e.primary = e.id === id))
}

const environmentError = computed(() => environmentsProblem(form.environments))

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid || environmentError.value) return
  emit('save', { ...form, key: form.key.toUpperCase() })
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" persistent>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <div>
          <h2 class="text-h5">{{ isEdit ? 'แก้ไขโปรเจกต์' : 'สร้างโปรเจกต์ใหม่' }}</h2>
          <p class="text-body-2 text-muted">ช่องที่มี * จำเป็นต้องกรอก</p>
        </div>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>

      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <!-- identity -->
            <v-col cols="12" sm="4">
              <span class="fox-label">โลโก้</span>
              <div
                class="logo-drop"
                :class="{ 'logo-drop--active': dragging }"
                role="button"
                tabindex="0"
                aria-label="อัปโหลดโลโก้"
                @click="fileInput?.click()"
                @keydown.enter="fileInput?.click()"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="onDrop"
              >
                <ProjectAvatar :project="{ name: form.name, key: form.key, logo: form.logo }" size="56" />
                <v-progress-circular v-if="uploadingLogo" indeterminate size="18" width="2" color="primary" />
                <span v-else class="text-caption text-muted">{{ form.logo ? 'คลิกเพื่อเปลี่ยน' : 'ลากไฟล์มาวาง หรือคลิก' }}</span>
                <v-btn v-if="form.logo" variant="text" size="x-small" color="error" @click.stop="form.logo = ''">ลบโลโก้</v-btn>
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  class="d-none"
                  @change="readLogo(($event.target as HTMLInputElement).files?.[0])"
                />
              </div>
              <div v-if="logoError" class="text-caption text-error mt-1">{{ logoError }}</div>
            </v-col>
            <v-col cols="12" sm="8">
              <div class="fox-stack">
                <div>
                  <label class="fox-label" for="pj-key">Project Key *</label>
                  <v-text-field
                    id="pj-key"
                    v-model="form.key"
                    placeholder="เช่น PAY, SHOP, AUTH"
                    :maxlength="PROJECT_KEY_MAX"
                    counter
                    hint="ใช้เป็นรหัสย่อของโปรเจกต์"
                    persistent-hint
                    :rules="[rules.required, rules.key]"
                    @update:model-value="form.key = String($event ?? '').toUpperCase()"
                  />
                </div>
                <div>
                  <label class="fox-label" for="pj-name">ชื่อโปรเจกต์ *</label>
                  <v-text-field id="pj-name" v-model="form.name" placeholder="เช่น PromptPay QR Gateway" :rules="[rules.required]" />
                </div>
              </div>
            </v-col>

            <!-- scope -->
            <v-col cols="12">
              <label class="fox-label" for="pj-desc">คำอธิบาย</label>
              <v-textarea id="pj-desc" v-model="form.description" rows="2" auto-grow placeholder="วัตถุประสงค์ ขอบเขตการทดสอบ หรือสถาปัตยกรรมระบบ" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="pj-tags">Tags</label>
              <v-combobox id="pj-tags" v-model="form.tags" multiple chips closable-chips placeholder="พิมพ์แล้วกด Enter เช่น API, Payment" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="pj-teams">ทีมที่เข้าถึงได้</label>
              <v-autocomplete
                id="pj-teams"
                v-model="form.teamIds"
                :items="teams"
                item-title="name"
                item-value="id"
                multiple
                chips
                closable-chips
                prepend-inner-icon="tabler:users-group"
                placeholder="ทุกคนที่มี Role"
                hint="ไม่เลือกทีม = ทุกคนที่มี Role เข้าถึงได้ · Admin เข้าถึงได้ทุกโปรเจกต์"
                persistent-hint
              >
                <template #chip="{ props: chip, item }">
                  <v-chip v-bind="chip" size="small" :color="item.raw.tone" variant="tonal">{{ item.raw.name }}</v-chip>
                </template>
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :subtitle="`${raw.memberIds.length} คน · ${raw.description}`" />
                </template>
              </v-autocomplete>
            </v-col>

            <!-- environments -->
            <v-col cols="12">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="fox-label mb-0">Environment ที่ทดสอบ</span>
                <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:plus" @click="addEnvironment">เพิ่ม Environment</v-btn>
              </div>
              <div class="fox-stack milestones">
                <v-row v-for="e in form.environments" :key="e.id" dense class="align-center">
                  <v-col cols="12" sm="4">
                    <v-text-field
                      v-model="e.name"
                      aria-label="ชื่อ Environment"
                      :maxlength="ENVIRONMENT_NAME_MAX"
                      :rules="[rules.required]"
                      @update:model-value="e.name = String($event ?? '').toUpperCase()"
                    />
                  </v-col>
                  <v-col cols="12" sm="4">
                    <v-select
                      v-model="e.teamId"
                      :items="teams"
                      item-title="name"
                      item-value="id"
                      clearable
                      placeholder="ทีมที่ดูแล Server"
                      aria-label="ทีมที่ดูแล Server"
                      prepend-inner-icon="tabler:server"
                    />
                  </v-col>
                  <v-col cols="10" sm="3">
                    <v-chip v-if="e.primary" color="primary" variant="tonal" prepend-icon="tabler:star">หลัก</v-chip>
                    <v-btn v-else variant="text" size="small" color="primary" @click="makePrimary(e.id)">ตั้งเป็นหลัก</v-btn>
                  </v-col>
                  <v-col cols="2" sm="1" class="text-end">
                    <v-btn
                      icon="tabler:trash"
                      variant="text"
                      size="small"
                      color="error"
                      :disabled="form.environments.length === 1"
                      :aria-label="`ลบ Environment ${e.name}`"
                      @click="removeEnvironment(e.id)"
                    />
                  </v-col>
                </v-row>
              </div>
              <p class="text-caption text-muted mb-0">
                ผลบน Environment หลักคือสถานะของ Test Case (วงจร Dev ↔ QA) · Environment อื่นเก็บผลแยก เช่น STAGING ของลูกค้า · ปัญหาด้าน Server
                จะส่งถึงทีมที่ดูแล Environment นั้น (ทีมนี้เข้าโปรเจกต์ได้ด้วย)
              </p>
              <div v-if="environmentError" class="text-caption text-error mt-1">{{ environmentError }}</div>
            </v-col>

            <!-- timeline -->
            <v-col cols="12" sm="6">
              <label class="fox-label" for="pj-deadline">กำหนดส่งเป้าหมาย</label>
              <v-text-field id="pj-deadline" v-model="form.targetDeadline" type="date" prepend-inner-icon="tabler:calendar-due" />
            </v-col>
            <v-col cols="12" sm="6">
              <label class="fox-label" for="pj-status">สถานะ</label>
              <v-select id="pj-status" v-model="form.status" :items="PROJECT_STATUSES" item-title="label" item-value="value">
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :prepend-icon="raw.icon" :subtitle="raw.hint" :base-color="raw.tone" />
                </template>
              </v-select>
            </v-col>

            <!-- milestones -->
            <v-col cols="12">
              <div class="d-flex align-center justify-space-between mb-2">
                <span class="fox-label mb-0">Milestones</span>
                <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:plus" @click="addMilestone">เพิ่ม Milestone</v-btn>
              </div>
              <div v-if="form.milestones?.length" class="fox-stack milestones">
                <v-row v-for="m in form.milestones" :key="m.id" dense class="align-center">
                  <v-col cols="12" sm="4">
                    <v-select v-model="m.type" :items="MILESTONE_TYPES" item-title="label" item-value="value" aria-label="ประเภท Milestone" />
                  </v-col>
                  <v-col cols="12" sm="4">
                    <v-text-field v-model="m.title" aria-label="ชื่อ Milestone" :rules="[rules.required]" />
                  </v-col>
                  <v-col cols="10" sm="3">
                    <v-text-field v-model="m.date" type="date" aria-label="วันที่ Milestone" :rules="[rules.required]" />
                  </v-col>
                  <v-col cols="2" sm="1" class="text-end">
                    <v-btn icon="tabler:trash" variant="text" size="small" color="error" aria-label="ลบ Milestone" @click="removeMilestone(m.id)" />
                  </v-col>
                </v-row>
              </div>
              <p v-else class="text-body-2 text-muted mb-0">ยังไม่มี Milestone เช่น Code Freeze, UAT Sign-off, Go-Live</p>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <div class="d-flex justify-end ga-3 fox-card-body pt-0">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" :loading="loading" @click="submit">{{ isEdit ? 'บันทึก' : 'สร้างโปรเจกต์' }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.logo-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 148px;
  padding: 16px;
  text-align: center;
  border: 1px dashed rgba(var(--v-theme-primary), 0.4);
  border-radius: var(--fox-radius-control);
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.logo-drop:hover,
.logo-drop:focus-visible,
.logo-drop--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.04);
  outline: none;
}

.milestones {
  --fox-gutter: 4px;
}
</style>
