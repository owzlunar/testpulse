<script setup lang="ts">
import type { SearchHit } from '@/composables/useUniversalSearch'

// One universal-search result (the header's dropdown and the results page)
defineProps<{ hit: SearchHit }>()
defineEmits<{ open: [hit: SearchHit] }>()
</script>

<template>
  <v-list-item class="py-2 search-hit" @click="$emit('open', hit)">
    <v-list-item-title class="text-subtitle-2">
      <span v-if="hit.projectKey" class="text-muted fox-num">{{ hit.projectKey }} · </span>
      <span class="text-primary fox-num mr-1">{{ hit.code }}</span> {{ hit.title }}
    </v-list-item-title>
    <v-list-item-subtitle v-if="hit.subtitle" class="text-caption">{{ hit.subtitle }}</v-list-item-subtitle>
    <template v-if="hit.chip" #append>
      <v-chip :color="hit.chip.tone" size="x-small" variant="tonal" class="ml-2">{{ hit.chip.text }}</v-chip>
    </template>
  </v-list-item>
</template>
