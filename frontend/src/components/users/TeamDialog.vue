<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { storeToRefs } from 'pinia'
import type { VForm } from 'vuetify/components'
import UserAvatar from '@/components/users/UserAvatar.vue'
import { ROLE_TONES } from '@/services/role.service'
import { useAuthStore } from '@/stores/auth.store'
import type { Team, TeamInput } from '@/types'
import { required } from '@/utils/validators'

// Create / edit a team: name, colour and members (a user can be in several teams)
const open = defineModel<boolean>({ default: false })
const props = withDefaults(defineProps<{ team?: Team | null; loading?: boolean }>(), { team: null, loading: false })
const emit = defineEmits<{ save: [input: TeamInput] }>()

const auth = useAuthStore()
const { users } = storeToRefs(auth)

const empty = (): TeamInput => ({ name: '', description: '', tone: 'primary', memberIds: [] })
const form = reactive<TeamInput>(empty())
const formRef = ref<VForm>()

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, empty(), props.team ? JSON.parse(JSON.stringify(props.team)) : { id: undefined })
  },
  { immediate: true },
)
useUnsavedChanges(open, () => form)

async function submit() {
  const result = await formRef.value?.validate()
  if (result?.valid) emit('save', JSON.parse(JSON.stringify(form)))
}
</script>

<template>
  <v-dialog v-model="open" max-width="600">
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <h2 class="text-h5">{{ team ? `แก้ไข${team.name}` : 'สร้างทีม' }}</h2>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <v-row dense class="fox-form-grid">
            <v-col cols="12">
              <label class="fox-label" for="team-name">ชื่อทีม *</label>
              <v-text-field id="team-name" v-model="form.name" placeholder="เช่น ทีม Payment" :rules="[required]" />
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="team-desc">คำอธิบาย</label>
              <v-text-field id="team-desc" v-model="form.description" placeholder="ระบบหรือผลิตภัณฑ์ที่ทีมดูแล" />
            </v-col>
            <v-col cols="12">
              <div class="fox-label">สี</div>
              <v-chip-group v-model="form.tone" mandatory>
                <v-chip v-for="t in ROLE_TONES" :key="t" :value="t" :color="t" :base-color="t" variant="flat" size="small" :aria-label="t">
                  <v-icon v-if="form.tone === t" icon="tabler:check" size="14" />
                </v-chip>
              </v-chip-group>
            </v-col>
            <v-col cols="12">
              <label class="fox-label" for="team-members">สมาชิก</label>
              <v-autocomplete
                id="team-members"
                v-model="form.memberIds"
                :items="users"
                item-title="name"
                item-value="id"
                multiple
                chips
                closable-chips
                prepend-inner-icon="tabler:users"
                placeholder="เลือกผู้ใช้"
              >
                <template #chip="{ props: chip, item }">
                  <v-chip v-bind="chip" size="small">
                    <template #prepend><UserAvatar :user="item.raw" size="18" class="mr-1" /></template>
                    {{ item.raw.name }}
                  </v-chip>
                </template>
                <template #item="{ props: item, item: { raw } }">
                  <v-list-item v-bind="item" :subtitle="`${auth.roleOf(raw).label}${raw.title ? ` · ${raw.title}` : ''}`">
                    <template #prepend><UserAvatar :user="raw" size="28" class="mr-3" /></template>
                  </v-list-item>
                </template>
              </v-autocomplete>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <v-divider />
      <div class="d-flex justify-end ga-3 fox-card-body py-4">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:device-floppy" :loading="loading" @click="submit">{{ team ? 'บันทึก' : 'สร้างทีม' }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
