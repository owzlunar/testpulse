<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { useAppStore } from '@/stores/app.store'
import FoxConfirmDialog from '@/components/ui/FoxConfirmDialog.vue'
import { answerLeave, leavePrompt } from '@/composables/useUnsavedChanges'

const route = useRoute()
const app = useAppStore()
const layout = computed(() => (route.meta.layout === 'blank' ? BlankLayout : DefaultLayout))
// nothing until the first navigation is done (it waits for start-up): a shell shown earlier would
// react to clicks, then the first route change resets it (e.g. closes a drawer just opened)
const routed = ref(false)
useRouter()
  .isReady()
  .then(() => (routed.value = true))
// closing the leave prompt any way but its confirm button means stay
const leaveOpen = computed({ get: () => leavePrompt.show, set: (v) => !v && answerLeave(false) })
</script>

<template>
  <v-app>
    <component :is="layout" v-if="routed" />
    <v-progress-linear v-else indeterminate color="primary" class="app-starting" aria-label="กำลังโหลด" />
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

<style scoped>
.app-starting {
  position: fixed;
  inset: 0 0 auto;
}
</style>
