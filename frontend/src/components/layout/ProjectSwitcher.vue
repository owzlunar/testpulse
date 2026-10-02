<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ProjectAvatar from '@/components/projects/ProjectAvatar.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useProjectStore } from '@/stores/project.store'
import { projectStatusOf } from '@/domain/project'

// Google Cloud Console style project picker in the app bar
const router = useRouter()
const auth = useAuthStore()
const projectStore = useProjectStore()
const { projects, currentProject, selectedProjectId } = storeToRefs(projectStore)

const open = ref(false)
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return projects.value.filter((p) => !q || `${p.name} ${p.key}`.toLowerCase().includes(q))
})

function pick(id: string) {
  projectStore.select(id)
  open.value = false
}

function createProject() {
  open.value = false
  router.push({ path: '/dashboard', query: { action: 'new-project' } })
}
</script>

<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom start">
    <template #activator="{ props }">
      <v-btn v-bind="props" variant="tonal" color="primary" class="project-switcher" append-icon="tabler:selector">
        <ProjectAvatar :project="currentProject" size="24" class="mr-sm-2" />
        <span class="project-switcher__name text-truncate d-none d-sm-inline">{{ currentProject?.name ?? 'เลือกโปรเจกต์' }}</span>
      </v-btn>
    </template>

    <v-card width="400" max-width="calc(100vw - 32px)">
      <div class="d-flex align-center justify-space-between px-5 pt-4 pb-3">
        <span class="text-h6">เลือกโปรเจกต์</span>
        <v-btn v-if="auth.isAdmin" variant="text" color="primary" size="small" prepend-icon="tabler:plus" @click="createProject">สร้างใหม่</v-btn>
      </div>
      <div class="px-5 pb-2">
        <v-text-field
          v-model="search"
          density="compact"
          placeholder="ค้นหาชื่อหรือ Key"
          prepend-inner-icon="tabler:search"
          aria-label="ค้นหาโปรเจกต์"
          clearable
          autofocus
        />
      </div>
      <v-list class="px-2 project-switcher__list">
        <v-list-item v-for="p in filtered" :key="p.id" :active="p.id === selectedProjectId" color="primary" class="py-2" @click="pick(p.id)">
          <template #prepend>
            <ProjectAvatar :project="p" size="36" class="mr-3" />
          </template>
          <v-list-item-title class="text-subtitle-2">{{ p.name }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ p.key }} · {{ projectStatusOf(p.status).hint }}</v-list-item-subtitle>
          <template #append>
            <v-icon v-if="p.id === selectedProjectId" icon="tabler:check" color="primary" size="18" />
          </template>
        </v-list-item>
        <div v-if="!filtered.length" class="text-body-2 text-muted text-center py-4">ไม่พบโปรเจกต์</div>
      </v-list>
    </v-card>
  </v-menu>
</template>

<style scoped>
.project-switcher {
  max-width: 280px;
}

.project-switcher__name {
  max-width: 180px;
}

@media (max-width: 1279.98px) {
  .project-switcher__name {
    max-width: 120px;
  }
}

.project-switcher__list {
  max-height: 320px;
  overflow-y: auto;
}
</style>
