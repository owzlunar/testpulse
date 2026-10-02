<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { useAppStore } from '@/stores/app.store'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import { answerLeave, leavePrompt } from '@/composables/useUnsavedChanges'

const route = useRoute()
const app = useAppStore()
const layout = computed(() => (route.meta.layout === 'blank' ? BlankLayout : DefaultLayout))
// closing the leave prompt any way but its confirm button means stay
const leaveOpen = computed({ get: () => leavePrompt.show, set: (v) => !v && answerLeave(false) })
</script>

<template>
  <v-app>
    <component :is="layout" />
    <!-- leaving a form with unsaved changes (useUnsavedChanges) -->
    <FoxConfirmDialog
      v-model="leaveOpen"
      title="ออกโดยไม่บันทึก?"
      text="การแก้ไขในฟอร์มนี้ยังไม่ได้บันทึก ถ้าออกตอนนี้การแก้ไขจะหายไป"
      confirm-text="ออกโดยไม่บันทึก"
      tone="warning"
      @confirm="answerLeave(true)"
    />
    <!-- API errors from any page -->
    <v-snackbar v-model="app.toast.show" color="error" :timeout="5000">
      <div class="d-flex align-center ga-2">
        <v-icon icon="tabler:alert-circle" />
        {{ app.toast.text }}
      </div>
    </v-snackbar>
  </v-app>
</template>
