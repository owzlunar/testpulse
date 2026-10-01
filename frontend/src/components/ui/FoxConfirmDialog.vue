<script setup lang="ts">
import type { Tone } from '@/types'

const open = defineModel<boolean>({ default: false })
withDefaults(defineProps<{ title?: string; text?: string; confirmText?: string; tone?: Tone }>(), {
  title: 'ยืนยันการทำรายการ',
  text: '',
  confirmText: 'ยืนยัน',
  tone: 'error',
})
const emit = defineEmits<{ confirm: [] }>()

function confirm() {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <v-dialog v-model="open" max-width="420">
    <v-card class="fox-card-body text-center">
      <v-avatar :color="tone" size="64" class="mx-auto mb-4">
        <v-icon icon="tabler:alert-triangle" size="32" />
      </v-avatar>
      <h2 class="text-h5 mb-2">{{ title }}</h2>
      <p class="text-body-1 text-muted mb-6">{{ text }}</p>
      <div class="d-flex justify-center ga-3">
        <v-btn variant="outlined" @click="open = false">ยกเลิก</v-btn>
        <v-btn :color="tone" variant="flat" @click="confirm">{{ confirmText }}</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>
