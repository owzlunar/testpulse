<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import NotificationDrawer from '@/components/layout/NotificationDrawer.vue'
import HelpDialog from '@/components/layout/HelpDialog.vue'
import FoxPageSkeleton from '@/components/ui/FoxPageSkeleton.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { useAppStore } from '@/stores/app.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useTestCaseStore } from '@/stores/test-case.store'

const route = useRoute()
const { lgAndUp } = useDisplay()
const { asideOpen } = storeToRefs(useLayoutStore())

// Left drawer: desktop = permanent, hamburger minifies it to a rail.
//              tablet/phone = temporary overlay, hamburger opens it.
const navOpen = ref(lgAndUp.value)
const rail = ref(false)
const isRail = computed(() => rail.value && lgAndUp.value)

function toggleNav() {
  if (lgAndUp.value) rail.value = !rail.value
  else navOpen.value = !navOpen.value
}

watch(lgAndUp, (desktop) => (navOpen.value = desktop))
watch(
  () => route.fullPath,
  () => {
    if (!lgAndUp.value) navOpen.value = false
  },
)

// Right sidebar: only for routes that register an `aside` view
const hasAside = computed(() => !!route.matched.at(-1)?.components?.aside)
watch([hasAside, lgAndUp], ([has, desktop]) => (asideOpen.value = has && desktop), { immediate: true })

// initial API calls, then one SLA check per session (due-soon / overdue cases raise notifications)
const app = useAppStore()
onMounted(async () => {
  await app.bootstrap()
  if (app.ready) useTestCaseStore().scanAllExpiries()
})
</script>

<template>
  <!-- left drawer is registered first so it runs full height next to the app bar -->
  <AppSidebar
    v-model="navOpen"
    :rail="isRail"
    :expand-on-hover="isRail"
    :permanent="lgAndUp"
    :temporary="!lgAndUp"
  />

  <AppHeader @toggle-nav="toggleNav" />

  <v-navigation-drawer
    v-if="hasAside"
    v-model="asideOpen"
    class="fox-aside"
    location="end"
    width="360"
    :temporary="!lgAndUp"
  >
    <router-view name="aside" />
  </v-navigation-drawer>

  <NotificationDrawer />
  <HelpDialog />

  <v-main class="bg-background">
    <div class="d-flex flex-column fill-height">
      <div class="fox-page flex-grow-1">
        <router-view v-if="app.ready" />
        <v-card v-else-if="app.failed">
          <FoxEmptyState icon="tabler:cloud-off" title="เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" :text="app.failed">
            <v-btn class="mt-3" color="primary" prepend-icon="tabler:refresh" @click="app.bootstrap()">ลองอีกครั้ง</v-btn>
          </FoxEmptyState>
        </v-card>
        <FoxPageSkeleton v-else />
      </div>
      <AppFooter v-if="app.ready" />
    </div>
  </v-main>
</template>
