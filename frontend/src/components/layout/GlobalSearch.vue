<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import ProjectAvatar from '@/components/projects/ProjectAvatar.vue'
import TestCaseStatusChip from '@/components/test-cases/TestCaseStatusChip.vue'
import { useProjectStore } from '@/stores/project.store'
import { useRequirementStore } from '@/stores/requirement.store'
import type { Project, TestCase } from '@/types'
import { testCaseApi } from '@/api'

// Universal search: projects (already loaded) and the test cases of every project (asked from the
// server, since cases load one project at a time). Before typing it shows the current project's cases.
const router = useRouter()
const projectStore = useProjectStore()
const { projects, currentCases } = storeToRefs(projectStore)
const requirementStore = useRequirementStore()

const open = ref(false)
const query = ref('')
const found = ref<{ cases: TestCase[]; total: number }>({ cases: [], total: 0 })

// ask once typing pauses; ignore answers to an older query
let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(timer)
  const text = q?.trim() ?? ''
  if (!text) {
    found.value = { cases: [], total: 0 }
    return
  }
  timer = setTimeout(async () => {
    const result = await testCaseApi.searchTestCases(text, 6).catch(() => ({ cases: [], total: 0 }))
    if ((query.value?.trim() ?? '') === text) found.value = result
  }, 250)
})

const results = computed(() => {
  const q = query.value?.trim().toLowerCase() ?? ''
  const projs = q ? projects.value.filter((p) => `${p.name} ${p.key} ${p.description}`.toLowerCase().includes(q)) : projects.value
  const cases = q ? found.value : { cases: currentCases.value, total: currentCases.value.length }
  return { cases: cases.cases.slice(0, 6), projects: projs.slice(0, 3), total: cases.total + projs.length }
})

function goToCase(tc: TestCase) {
  projectStore.select(tc.projectId)
  open.value = false
  router.push({ path: '/test-cases', query: { caseId: tc.id } })
}

function goToProject(p: Project) {
  projectStore.select(p.id)
  open.value = false
  router.push('/test-cases')
}
</script>

<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom start" :open-on-click="false">
    <template #activator="{ props }">
      <v-text-field
        v-bind="props"
        v-model="query"
        density="compact"
        placeholder="ค้นหา Test Case, Requirement, โปรเจกต์..."
        prepend-inner-icon="tabler:search"
        aria-label="ค้นหาทั้งระบบ"
        hide-details
        single-line
        clearable
        @focus="open = true"
        @update:model-value="open = true"
        @keydown.esc="open = false"
      />
    </template>

    <v-card width="480" max-width="calc(100vw - 32px)">
      <div class="d-flex align-center justify-space-between px-5 pt-4 pb-2">
        <span class="text-overline text-muted">ผลการค้นหา</span>
        <span class="text-caption text-muted fox-num">{{ results.total }} รายการ</span>
      </div>
      <v-list class="px-2 global-search__list">
        <template v-if="results.cases.length">
          <v-list-subheader>Test Cases</v-list-subheader>
          <v-list-item v-for="tc in results.cases" :key="tc.id" class="py-2" @click="goToCase(tc)">
            <v-list-item-title class="text-subtitle-2">
              <span class="text-primary fox-num mr-1">{{ tc.id }}</span> {{ tc.name }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption">{{ requirementStore.textFor(tc) }}</v-list-item-subtitle>
            <template #append>
              <TestCaseStatusChip :status="tc.status" size="x-small" class="ml-2" />
            </template>
          </v-list-item>
        </template>
        <template v-if="results.projects.length">
          <v-list-subheader>โปรเจกต์</v-list-subheader>
          <v-list-item v-for="p in results.projects" :key="p.id" class="py-2" @click="goToProject(p)">
            <template #prepend>
              <ProjectAvatar :project="p" size="32" class="mr-3" />
            </template>
            <v-list-item-title class="text-subtitle-2">{{ p.name }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">{{ p.key }}</v-list-item-subtitle>
          </v-list-item>
        </template>
        <div v-if="!results.total" class="text-body-2 text-muted text-center py-6">ไม่พบผลลัพธ์ที่ตรงกับ "{{ query }}"</div>
      </v-list>
    </v-card>
  </v-menu>
</template>

<style scoped>
.global-search__list {
  max-height: 400px;
  overflow-y: auto;
}
</style>
