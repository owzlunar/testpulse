<script setup lang="ts">
import { computed } from 'vue'
import ProjectAvatar from './ProjectAvatar.vue'
import TestCaseProgress from '@/components/test-cases/TestCaseProgress.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import type { Project } from '@/types'
import { daysFromToday, formatDateTH } from '@/utils/date'
import { projectStatusOf } from '@/domain/project'
import { apiOn } from '@/api'

const props = defineProps<{ project: Project; selected: boolean }>()
defineEmits<{ select: [id: string]; open: [id: string]; edit: [project: Project]; delete: [project: Project]; export: [id: string] }>()

const auth = useAuthStore()
const stats = computed(() => useProjectStore().statsFor(props.project.id))
const teams = computed(() => auth.teams.filter((t) => props.project.teamIds?.includes(t.id)))
const members = computed(() => auth.membersOf(props.project))
const status = computed(() => projectStatusOf(props.project.status))
/** test cases are on (rest mode hides them until the backend has them) */
const casesOn = apiOn['test-case']
const daysLeft = computed(() => (props.project.targetDeadline ? daysFromToday(props.project.targetDeadline) : null))
</script>

<template>
  <v-card
    class="project-card h-100 d-flex flex-column"
    :class="{ 'project-card--selected': selected }"
    :aria-pressed="selected"
    @click="$emit('select', project.id)"
  >
    <div class="fox-card-body pb-0 d-flex align-start ga-3">
      <ProjectAvatar :project="project" size="48" />
      <div class="flex-grow-1 overflow-hidden">
        <h3 class="text-h6 text-truncate" :title="project.name">{{ project.name }}</h3>
        <div class="d-flex flex-wrap align-center ga-2 mt-1">
          <v-chip :color="status.tone" size="x-small" variant="tonal" :prepend-icon="status.icon">{{ status.label }}</v-chip>
          <span class="text-caption text-muted">{{ project.key }}</span>
          <v-chip v-if="selected" color="primary" size="x-small" variant="flat">กำลังเลือก</v-chip>
        </div>
      </div>
      <v-menu location="bottom end">
        <template #activator="{ props: menu }">
          <v-btn v-bind="menu" icon="tabler:dots-vertical" variant="text" size="small" aria-label="ตัวเลือกโปรเจกต์" @click.stop />
        </template>
        <v-list>
          <v-list-item v-if="casesOn" prepend-icon="tabler:markdown" title="ส่งออก Obsidian (.md)" @click="$emit('export', project.id)" />
          <!-- projects are managed by Admins -->
          <template v-if="auth.isAdmin">
            <v-list-item prepend-icon="tabler:pencil" title="แก้ไขโปรเจกต์" @click="$emit('edit', project)" />
            <v-divider class="my-1" />
            <v-list-item prepend-icon="tabler:trash" title="ลบโปรเจกต์" base-color="error" @click="$emit('delete', project)" />
          </template>
        </v-list>
      </v-menu>
    </div>

    <div class="fox-card-body flex-grow-1 d-flex flex-column ga-4">
      <p class="text-body-2 text-muted fox-clamp-2 mb-0">{{ project.description || 'ไม่มีคำอธิบายโปรเจกต์' }}</p>
      <div v-if="teams.length" class="d-flex flex-wrap ga-1">
        <v-chip v-for="t in teams" :key="t.id" size="x-small" variant="flat" :color="t.tone" prepend-icon="tabler:users-group">{{ t.name }}</v-chip>
      </div>
      <div v-if="project.tags.length" class="d-flex flex-wrap ga-1">
        <v-chip v-for="tag in project.tags" :key="tag" size="x-small" variant="tonal" color="secondary">#{{ tag }}</v-chip>
      </div>
      <v-spacer />
      <TestCaseProgress v-if="casesOn" :stats="stats" :height="6" />
    </div>

    <v-divider />
    <div class="d-flex align-center justify-space-between px-4 py-2">
      <span class="d-inline-flex align-center ga-1 text-caption" :class="daysLeft !== null && daysLeft < 0 ? 'text-error' : 'text-muted'">
        <v-icon icon="tabler:calendar-due" size="16" />
        {{ project.targetDeadline ? formatDateTH(project.targetDeadline) : 'ไม่ระบุกำหนดส่ง' }}
        <template v-if="daysLeft !== null">· {{ daysLeft < 0 ? `เลย ${-daysLeft} วัน` : `อีก ${daysLeft} วัน` }}</template>
      </span>
      <span class="d-inline-flex align-center ga-1 text-caption text-muted" :title="members.map((u) => u.name).join(', ')">
        <v-icon icon="tabler:users" size="16" /><span class="fox-num">{{ members.length }}</span> คน
      </span>
      <v-btn v-if="casesOn" variant="text" color="primary" size="small" append-icon="tabler:arrow-right" @click.stop="$emit('open', project.id)">
        <span class="fox-num">{{ stats.total }}</span
        >&nbsp;Test Cases
      </v-btn>
    </div>
  </v-card>
</template>

<style scoped>
.project-card {
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: -2px;
  transition:
    outline-color 0.15s,
    transform 0.15s;
}

.project-card:hover {
  transform: translateY(-2px);
}

.project-card--selected {
  outline-color: rgb(var(--v-theme-primary));
}
</style>
