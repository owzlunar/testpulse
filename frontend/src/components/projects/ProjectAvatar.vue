<script setup lang="ts">
import type { Project } from '@/types'
import { firstLetter } from '@/utils/format'

// Project logo, or the first letter of its name when there is no logo
withDefaults(defineProps<{ project: Pick<Project, 'name' | 'key' | 'logo'> | null; size?: number | string }>(), { size: 40 })
</script>

<template>
  <v-avatar :size="size" rounded="lg" :color="project?.logo ? undefined : 'primary'" :variant="project?.logo ? 'flat' : 'tonal'">
    <v-img v-if="project?.logo" :src="project.logo" :alt="project.name" cover />
    <span v-else class="text-subtitle-2">{{ firstLetter(project?.name || project?.key || 'P') }}</span>
  </v-avatar>
</template>
