<script setup lang="ts">
withDefaults(
  defineProps<{
    /** hide the word mark (used by the minified sidebar / phones) */
    iconOnly?: boolean
  }>(),
  { iconOnly: false },
)
</script>

<template>
  <router-link to="/dashboard" class="app-logo text-high-emphasis" aria-label="TestPulse">
    <svg class="app-logo__mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect class="text-primary" fill="currentColor" x="2" y="2" width="28" height="28" rx="8" />
      <path
        class="on-primary"
        d="M7 17h4l2.5-6 4 11 2.5-5H25"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle class="text-warning" fill="currentColor" cx="25" cy="17" r="2.6" />
    </svg>
    <span v-if="!iconOnly" class="text-h4 fox-logo__text">Test<span class="text-primary">Pulse</span></span>
  </router-link>
</template>

<style scoped>
.app-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.app-logo__mark {
  width: 32px;
  height: 32px;
  flex: none;
}

.fox-logo__text {
  white-space: nowrap;
}
</style>
