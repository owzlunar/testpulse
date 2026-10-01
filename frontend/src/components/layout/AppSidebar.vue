<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import navigation from '@/router/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useProjectStore } from '@/stores/project.store'
import AppLogo from './AppLogo.vue'

withDefaults(defineProps<{ rail?: boolean }>(), { rail: false })

const auth = useAuthStore()
const layout = useLayoutStore()
const { currentCases } = storeToRefs(useProjectStore())

// hide items (and section headers) the current role has no permission for
const items = computed(() => navigation.filter((item) => !item.permission || auth.can(item.permission)))
const badgeOf = (to: string) => (to === '/test-cases' && currentCases.value.length ? String(currentCases.value.length) : '')
</script>

<template>
  <v-navigation-drawer class="fox-nav" width="264" rail-width="80" :rail="rail">
    <!-- prepend slot: the brand stays put while the menu scrolls -->
    <template #prepend>
      <div class="fox-nav__brand">
        <AppLogo />
      </div>
    </template>

    <v-list>
      <template v-for="item in items" :key="'header' in item ? item.header : item.title">
        <v-list-subheader v-if="'header' in item">{{ item.header }}</v-list-subheader>
        <v-list-item v-else :to="item.to" :prepend-icon="item.icon" :title="item.title">
          <template v-if="badgeOf(item.to)" #append>
            <v-chip size="x-small" color="primary" variant="tonal" class="fox-num">{{ badgeOf(item.to) }}</v-chip>
          </template>
          <v-tooltip v-if="rail" activator="parent" location="end">{{ item.title }}</v-tooltip>
        </v-list-item>
      </template>
      <v-list-item prepend-icon="tabler:logout" title="ออกจากระบบ" to="/login" base-color="error">
        <v-tooltip v-if="rail" activator="parent" location="end">ออกจากระบบ</v-tooltip>
      </v-list-item>
    </v-list>

    <template #append>
      <div class="pa-4 fox-nav__wide">
        <v-card color="light-primary" variant="flat" class="pa-5">
          <div class="d-flex align-start justify-space-between ga-2">
            <div class="text-h6">วิธีใช้งาน<br />TestPulse</div>
            <v-icon icon="tabler:help-circle" color="primary" size="28" />
          </div>
          <div class="text-caption text-muted mt-1 mb-4">วงจร Dev ↔ QA, SLA และเอกสาร UAT</div>
          <v-btn color="primary" size="small" @click="layout.helpOpen = true">เปิดคู่มือ</v-btn>
        </v-card>
      </div>
    </template>
  </v-navigation-drawer>
</template>

<style scoped>
.fox-nav__brand {
  display: flex;
  align-items: center;
  height: 72px;
  padding-inline: 24px;
  overflow: hidden;
}
</style>
