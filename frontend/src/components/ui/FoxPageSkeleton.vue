<script setup lang="ts">
// Placeholder while a page's data is loading: header, stat cards, content
withDefaults(defineProps<{ stats?: number; rows?: number }>(), { stats: 4, rows: 3 })
</script>

<template>
  <div aria-busy="true" aria-label="กำลังโหลด">
    <div class="fox-page-skeleton__head">
      <v-skeleton-loader type="text" width="160" class="bg-transparent" />
      <v-skeleton-loader type="heading" width="320" class="bg-transparent" />
    </div>
    <div class="fox-stack">
      <v-row v-if="stats" class="fox-grid">
        <v-col v-for="i in stats" :key="i" cols="12" sm="6" lg="3">
          <v-card class="fox-card-body"><v-skeleton-loader type="list-item-avatar-two-line" /></v-card>
        </v-col>
      </v-row>
      <v-card v-for="i in rows" :key="i" class="fox-card-body">
        <v-skeleton-loader type="heading, paragraph" />
      </v-card>
    </div>
  </div>
</template>

<style scoped>
.fox-page-skeleton__head {
  margin-bottom: var(--fox-gutter);
}
</style>
