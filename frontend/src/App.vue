<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { useAppStore } from '@/stores/app.store'

const route = useRoute()
const app = useAppStore()
const layout = computed(() => (route.meta.layout === 'blank' ? BlankLayout : DefaultLayout))
</script>

<template>
  <v-app>
    <component :is="layout" />
    <!-- API errors from any page -->
    <v-snackbar v-model="app.toast.show" color="error" :timeout="5000">
      <div class="d-flex align-center ga-2">
        <v-icon icon="tabler:alert-circle" />
        {{ app.toast.text }}
      </div>
    </v-snackbar>
  </v-app>
</template>
