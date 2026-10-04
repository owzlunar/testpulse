<script setup lang="ts">
// The steps of a wizard dialog (1 → 2 → 3): done ones ticked, the current one highlighted
defineProps<{ steps: string[]; step: number }>()
</script>

<template>
  <div class="fox-steps">
    <div v-for="(label, i) in steps" :key="label" class="fox-step" :class="{ 'fox-step--on': step >= i + 1 }">
      <v-avatar :color="step >= i + 1 ? 'primary' : 'secondary'" :variant="step > i + 1 ? 'flat' : 'tonal'" size="28">
        <v-icon v-if="step > i + 1" icon="tabler:check" size="16" />
        <span v-else class="text-caption fox-num">{{ i + 1 }}</span>
      </v-avatar>
      <span class="text-subtitle-2">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.fox-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
}

.fox-step {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(var(--v-theme-muted));
}

.fox-step--on {
  color: rgb(var(--v-theme-on-surface));
}
</style>
