<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import SearchHitItem from '@/components/search/SearchHitItem.vue'
import { useUniversalSearch, type SearchHit, type SearchKind, type SearchPage } from '@/composables/useUniversalSearch'
import { useProjectStore } from '@/stores/project.store'

// Universal search: test cases, requirements, defects, runs and documents of every project the user
// may open (asked from the server), and projects. A few of each here; "ดูทั้งหมด" opens the results
// page (/search), which loads the rest as it scrolls. Before typing it shows the current project's cases.
const router = useRouter()
const { currentCases, projects } = storeToRefs(useProjectStore())
const { groups, caseHit, projectHit, open: openHit } = useUniversalSearch()

/** how many of each group the dropdown shows */
const SHOWN: Record<SearchKind, number> = { cases: 5, requirements: 3, defects: 3, runs: 3, documents: 3, projects: 3 }

const open = ref(false)
const query = ref('')
const found = ref<Partial<Record<SearchKind, SearchPage>>>({})
/** typing or waiting for the server: no "not found" yet */
const searching = ref(false)
const text = computed(() => query.value?.trim() ?? '')

// ask once typing pauses; ignore answers to an older query
let timer: ReturnType<typeof setTimeout> | undefined
watch(text, (q) => {
  clearTimeout(timer)
  found.value = {}
  searching.value = !!q
  if (!q) return
  timer = setTimeout(async () => {
    const pages = await Promise.all(groups.value.map((g) => g.fetch(q, SHOWN[g.kind], 0).catch((): SearchPage => ({ hits: [], total: 0 }))))
    if (text.value !== q) return
    found.value = Object.fromEntries(groups.value.map((g, i) => [g.kind, pages[i]]))
    searching.value = false
  }, 250)
})

const sections = computed(() => {
  if (!text.value) {
    const cases = currentCases.value.slice(0, SHOWN.cases).map(caseHit)
    const projectHits = projects.value.slice(0, SHOWN.projects).map(projectHit)
    return [
      { kind: 'cases' as const, label: 'Test Cases', hits: cases, total: cases.length },
      { kind: 'projects' as const, label: 'โปรเจกต์', hits: projectHits, total: projectHits.length },
    ].filter((s) => s.hits.length)
  }
  return groups.value.map((g) => ({ kind: g.kind, label: g.label, ...(found.value[g.kind] ?? { hits: [], total: 0 }) })).filter((s) => s.hits.length)
})
const total = computed(() => sections.value.reduce((sum, s) => sum + s.total, 0))

function go(hit: SearchHit) {
  open.value = false
  openHit(hit)
}

/** the results page, on one group's tab or the first */
function showAll(kind?: SearchKind) {
  if (!text.value) return
  open.value = false
  router.push({ path: '/search', query: { q: text.value, ...(kind ? { type: kind } : {}) } })
}
</script>

<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom start" :open-on-click="false">
    <template #activator="{ props }">
      <v-text-field
        v-bind="props"
        v-model="query"
        density="compact"
        placeholder="ค้นหา Test Case, Requirement, Defect, เอกสาร..."
        prepend-inner-icon="tabler:search"
        aria-label="ค้นหาทั้งระบบ"
        hide-details
        single-line
        clearable
        @focus="open = true"
        @update:model-value="open = true"
        @keydown.esc="open = false"
        @keydown.enter="showAll()"
      />
    </template>

    <v-card width="520" max-width="calc(100vw - 32px)">
      <div class="d-flex align-center justify-space-between px-5 pt-4 pb-2">
        <span class="text-overline text-muted">ผลการค้นหา</span>
        <span v-if="!searching" class="text-caption text-muted fox-num">{{ total }} รายการ</span>
      </div>
      <v-progress-linear v-if="searching" indeterminate color="primary" height="2" aria-label="กำลังค้นหา" />
      <v-list class="px-2 global-search__list">
        <template v-for="s in sections" :key="s.kind">
          <v-list-subheader class="d-flex">
            <span>{{ s.label }}</span>
            <v-btn
              v-if="text && s.total > s.hits.length"
              variant="text"
              size="x-small"
              color="primary"
              class="ml-2"
              :aria-label="`ดูทั้งหมด ${s.label}`"
              @click="showAll(s.kind)"
              >ดูทั้งหมด {{ s.total }}</v-btn
            >
          </v-list-subheader>
          <SearchHitItem v-for="hit in s.hits" :key="hit.key" :hit="hit" @open="go" />
        </template>
        <div v-if="!searching && text && !total" class="text-body-2 text-muted text-center py-6">ไม่พบผลลัพธ์ที่ตรงกับ "{{ text }}"</div>
      </v-list>
      <template v-if="text && total && !searching">
        <v-divider />
        <div class="pa-2">
          <v-btn block variant="text" color="primary" append-icon="tabler:arrow-right" @click="showAll()">ดูผลการค้นหาทั้งหมด</v-btn>
        </div>
      </template>
    </v-card>
  </v-menu>
</template>

<style scoped>
.global-search__list {
  max-height: 420px;
  overflow-y: auto;
}
</style>
