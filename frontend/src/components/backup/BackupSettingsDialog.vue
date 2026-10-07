<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { VForm } from 'vuetify/components'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { WEEKDAYS, cronOf, scheduleOf } from '@/domain/backup'
import { useAuthStore } from '@/stores/auth.store'
import type { BackupSettings, BackupSettingsInput } from '@/types'
import { email } from '@/utils/validators'

// When the agent backs up and drills, and where its alerts go (email to TestPulse teams, a Teams
// channel, Uptime Kuma). Secret URLs are never shown back: empty keeps the one set, "ลบ" removes it.
const open = defineModel<boolean>({ default: false })
const props = withDefaults(defineProps<{ settings: BackupSettings | null; loading?: boolean; testing?: boolean }>(), {
  loading: false,
  testing: false,
})
const emit = defineEmits<{ save: [input: BackupSettingsInput]; test: [] }>()

const auth = useAuthStore()
const { teams } = storeToRefs(auth)

type Every = 'day' | 'week' | 'cron'
interface EntryForm {
  enabled: boolean
  every: Every
  time: string
  weekday: number
  cron: string
  staleAfterHours: number
}
type SecretName = 'teamsWebhookUrl' | 'kumaBackupUrl' | 'kumaDrillUrl'

const entry = (cron = '0 2 * * *', enabled = true, staleAfterHours = 26): EntryForm => {
  const s = scheduleOf(cron)
  return {
    enabled,
    every: s.every,
    time: s.every === 'cron' ? '02:00' : s.time,
    weekday: s.every === 'week' ? s.weekday : 0,
    cron,
    staleAfterHours,
  }
}
const form = reactive({
  backup: entry(),
  drill: entry('0 3 * * 0', true, 170),
  emailEnabled: true,
  teamIds: [] as string[],
  extraEmails: [] as string[],
  teamsEnabled: false,
  /** a new value (empty: keep what is set) and "remove it" */
  secrets: { teamsWebhookUrl: '', kumaBackupUrl: '', kumaDrillUrl: '' } as Record<SecretName, string>,
  clear: { teamsWebhookUrl: false, kumaBackupUrl: false, kumaDrillUrl: false } as Record<SecretName, boolean>,
})
const formRef = ref<VForm>()

watch(
  open,
  (isOpen) => {
    const s = props.settings
    if (!isOpen || !s) return
    Object.assign(form, {
      backup: entry(s.schedule.backup.cron, s.schedule.backup.enabled, s.schedule.backup.staleAfterHours),
      drill: entry(s.schedule.drill.cron, s.schedule.drill.enabled, s.schedule.drill.staleAfterHours),
      emailEnabled: s.alerts.emailEnabled,
      teamIds: [...s.alerts.teamIds],
      extraEmails: [...s.alerts.extraEmails],
      teamsEnabled: s.alerts.teamsEnabled,
      secrets: { teamsWebhookUrl: '', kumaBackupUrl: '', kumaDrillUrl: '' },
      clear: { teamsWebhookUrl: false, kumaBackupUrl: false, kumaDrillUrl: false },
    })
  },
  { immediate: true },
)
useUnsavedChanges(open, () => form)

const EVERY = [
  { value: 'day', title: 'ทุกวัน' },
  { value: 'week', title: 'ทุกสัปดาห์' },
  { value: 'cron', title: 'กำหนดเอง (cron)' },
]
const WEEKDAY_ITEMS = WEEKDAYS.map((title, value) => ({ title: `วัน${title}`, value }))
const ENTRIES = [
  { key: 'backup', title: 'สำรองข้อมูล', hint: 'dump ฐานข้อมูล ส่งไป off-site แล้วตรวจ' },
  { key: 'drill', title: 'ซ้อมกู้', hint: 'กู้ลงฐานซ้อมแล้วเทียบกับฐานจริง' },
] as const

const isSet = (name: SecretName) =>
  !!props.settings &&
  !form.clear[name] &&
  (name === 'teamsWebhookUrl' ? props.settings.alerts.teamsWebhookSet : props.settings.alerts[`${name}Set` as 'kumaBackupUrlSet'])

const url = (v: unknown) => !v || /^https?:\/\/\S+$/.test(String(v)) || 'ต้องเป็น URL ที่ขึ้นต้นด้วย http:// หรือ https://'
const cronRule = (v: unknown) =>
  String(v ?? '')
    .trim()
    .split(/\s+/).length === 5 || 'cron ต้องมี 5 ช่อง: นาที ชั่วโมง วัน เดือน วันในสัปดาห์'
const hours = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 1440) || '1 - 1440 ชั่วโมง'
const emails = (v: unknown) => (Array.isArray(v) ? v : []).every((e) => email(e) === true) || 'มีอีเมลที่รูปแบบไม่ถูกต้อง'
const webhookNeeded = () => !form.teamsEnabled || !!form.secrets.teamsWebhookUrl || isSet('teamsWebhookUrl') || 'เปิด Teams ต้องใส่ webhook URL'

function cronFor(e: EntryForm): string {
  return e.every === 'cron'
    ? cronOf({ every: 'cron', cron: e.cron })
    : e.every === 'week'
      ? cronOf({ every: 'week', weekday: e.weekday, time: e.time })
      : cronOf({ every: 'day', time: e.time })
}

function secret(name: SecretName): string | null | undefined {
  if (form.clear[name]) return null
  return form.secrets[name].trim() || undefined
}

async function submit() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return
  const schedule = (e: EntryForm) => ({ enabled: e.enabled, cron: cronFor(e), staleAfterHours: Number(e.staleAfterHours) })
  const input: BackupSettingsInput = {
    schedule: { backup: schedule(form.backup), drill: schedule(form.drill) },
    alerts: {
      emailEnabled: form.emailEnabled,
      teamIds: [...form.teamIds],
      extraEmails: form.extraEmails.map((e) => e.trim()).filter(Boolean),
      teamsEnabled: form.teamsEnabled,
    },
  }
  for (const name of ['teamsWebhookUrl', 'kumaBackupUrl', 'kumaDrillUrl'] as const) {
    const value = secret(name)
    if (value !== undefined) input.alerts[name] = value
  }
  emit('save', input)
}
</script>

<template>
  <v-dialog v-model="open" max-width="760" scrollable>
    <v-card>
      <div class="d-flex align-center justify-space-between fox-card-body pb-0">
        <h2 class="text-h5">ตั้งค่าการสำรองข้อมูล</h2>
        <v-btn icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="open = false" />
      </div>
      <v-card-text class="fox-card-body">
        <v-form ref="formRef" @submit.prevent="submit">
          <div class="text-overline text-muted">ตารางเวลา ({{ settings?.schedule.timezone ?? 'Asia/Bangkok' }})</div>
          <v-row v-for="e in ENTRIES" :key="e.key" dense class="fox-form-grid mb-2">
            <v-col cols="12" class="d-flex align-center ga-2">
              <v-switch
                v-model="form[e.key].enabled"
                color="primary"
                hide-details
                density="compact"
                :label="e.title"
                :aria-label="`เปิด${e.title}ตามเวลา`"
              />
              <span class="text-caption text-muted">{{ e.hint }}</span>
            </v-col>
            <template v-if="form[e.key].enabled">
              <v-col cols="12" sm="4">
                <label class="fox-label" :for="`${e.key}-every`">ความถี่</label>
                <v-select :id="`${e.key}-every`" v-model="form[e.key].every" :items="EVERY" />
              </v-col>
              <v-col v-if="form[e.key].every === 'week'" cols="12" sm="4">
                <label class="fox-label" :for="`${e.key}-weekday`">วัน</label>
                <v-select :id="`${e.key}-weekday`" v-model="form[e.key].weekday" :items="WEEKDAY_ITEMS" />
              </v-col>
              <v-col v-if="form[e.key].every !== 'cron'" cols="12" sm="4">
                <label class="fox-label" :for="`${e.key}-time`">เวลา</label>
                <v-text-field :id="`${e.key}-time`" v-model="form[e.key].time" type="time" />
              </v-col>
              <v-col v-else cols="12" sm="8">
                <label class="fox-label" :for="`${e.key}-cron`">cron</label>
                <v-text-field :id="`${e.key}-cron`" v-model="form[e.key].cron" placeholder="0 2 * * *" :rules="[cronRule]" />
              </v-col>
              <v-col cols="12" sm="4">
                <label class="fox-label" :for="`${e.key}-stale`">เตือนถ้าไม่สำเร็จเกิน (ชม.)</label>
                <v-text-field :id="`${e.key}-stale`" v-model.number="form[e.key].staleAfterHours" type="number" :rules="[hours]" />
              </v-col>
            </template>
          </v-row>

          <v-divider class="my-4" />
          <div class="text-overline text-muted">แจ้งเตือน</div>
          <p class="text-body-2 text-muted mb-3">
            แจ้งเมื่องานล้ม ไม่มี backup ตามรอบ หรือ disk ใกล้เต็ม และแจ้งอีกครั้งเมื่อกลับมาปกติ (Admin ทุกคนเห็นในระบบเสมอ)
          </p>
          <v-row dense class="fox-form-grid">
            <v-col cols="12">
              <v-switch v-model="form.emailEnabled" color="primary" hide-details density="compact" label="อีเมล (ผ่าน mail server ของ TestPulse)" />
            </v-col>
            <template v-if="form.emailEnabled">
              <v-col cols="12" sm="6">
                <label class="fox-label" for="alert-teams">ส่งถึงสมาชิกของทีม</label>
                <v-autocomplete
                  id="alert-teams"
                  v-model="form.teamIds"
                  :items="teams"
                  item-title="name"
                  item-value="id"
                  multiple
                  chips
                  closable-chips
                  prepend-inner-icon="tabler:users-group"
                  placeholder="เลือกทีม"
                />
              </v-col>
              <v-col cols="12" sm="6">
                <label class="fox-label" for="alert-emails">อีเมลเพิ่มเติม</label>
                <v-combobox
                  id="alert-emails"
                  v-model="form.extraEmails"
                  multiple
                  chips
                  closable-chips
                  prepend-inner-icon="tabler:mail"
                  placeholder="พิมพ์อีเมลแล้วกด Enter"
                  :rules="[emails]"
                />
              </v-col>
            </template>

            <v-col cols="12">
              <v-switch v-model="form.teamsEnabled" color="primary" hide-details density="compact" label="Microsoft Teams (channel ที่กำหนด)" />
            </v-col>
            <v-col v-if="form.teamsEnabled || isSet('teamsWebhookUrl')" cols="12">
              <label class="fox-label" for="alert-webhook">Webhook URL (Teams Workflows: Post to a channel when a webhook request is received)</label>
              <v-text-field
                id="alert-webhook"
                v-model="form.secrets.teamsWebhookUrl"
                :placeholder="
                  isSet('teamsWebhookUrl') ? `ตั้งไว้แล้ว (${settings?.alerts.teamsWebhookHint ?? ''}) เว้นว่างเพื่อใช้ค่าเดิม` : 'https://…'
                "
                :rules="[url, webhookNeeded]"
                autocomplete="off"
              >
                <template v-if="isSet('teamsWebhookUrl')" #append-inner>
                  <v-btn size="small" variant="text" color="error" @click="form.clear.teamsWebhookUrl = true">ลบ</v-btn>
                </template>
              </v-text-field>
            </v-col>

            <v-col cols="12">
              <div class="fox-label">Uptime Kuma (push monitor: เตือนเมื่อ agent หรือเครื่องเงียบไป)</div>
            </v-col>
            <v-col
              v-for="k in [
                { name: 'kumaBackupUrl', title: 'Push URL ของสำรองข้อมูล' },
                { name: 'kumaDrillUrl', title: 'Push URL ของซ้อมกู้' },
              ] as const"
              :key="k.name"
              cols="12"
              sm="6"
            >
              <label class="fox-label" :for="k.name">{{ k.title }}</label>
              <v-text-field
                :id="k.name"
                v-model="form.secrets[k.name]"
                :placeholder="isSet(k.name) ? 'ตั้งไว้แล้ว เว้นว่างเพื่อใช้ค่าเดิม' : 'https://kuma…/api/push/…'"
                :rules="[url]"
                autocomplete="off"
              >
                <template v-if="isSet(k.name)" #append-inner>
                  <v-btn size="small" variant="text" color="error" @click="form.clear[k.name] = true">ลบ</v-btn>
                </template>
              </v-text-field>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>
      <v-divider />
      <div class="d-flex align-center flex-wrap ga-3 fox-card-body py-4">
        <v-btn variant="text" prepend-icon="tabler:send" :loading="testing" @click="emit('test')">ส่งข้อความทดสอบ</v-btn>
        <v-spacer />
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn color="primary" prepend-icon="tabler:device-floppy" :loading="loading" @click="submit">บันทึก</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
