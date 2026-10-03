<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import SearchHitItem from '@/components/search/SearchHitItem.vue'
import { useUniversalSearch, type SearchHit, type SearchKind } from '@/composables/useUniversalSearch'

// Every match of the universal search, one tab per group; a tab loads the next page as it scrolls
// (/search?q=…&type=defects). The counts come from each group's first page.
const PAGE = 20

const route = useRoute()
const router = useRouter()
const { groups, open } = useUniversalSearch()

const q = computed(() => (typeof route.query.q === 'string' ? route.query.q.trim() : ''))
const input = ref(q.value)
watch(q, (v) => (input.value = v))

interface Results {
  hits: SearchHit[]
  total: number
}
const results = reactive<Partial<Record<SearchKind, Results>>>({})
/** the first page of every group, for the current query */
let firstPages: Promise<void> = Promise.resolve()
const loadingFirst = ref(false)

watch(
  q,
  (text) => {
    for (const k of Object.keys(results) as SearchKind[]) delete results[k]
    if (!text) return
    loadingFirst.value = true
    firstPages = Promise.all(
      groups.value.map(async (g) => {
        const page = await g.fetch(text, PAGE, 0).catch(() => ({ hits: [], total: 0 }))
        if (q.value === text) results[g.kind] = page
      }),
    ).then(() => {
      if (q.value === text) loadingFirst.value = false
    })
  },
  { immediate: true },
)

/** the tab in the URL, else the first group with matches */
const tab = computed<SearchKind | undefined>({
  get: () => {
    const asked = groups.value.find((g) => g.kind === route.query.type)
    return asked?.kind ?? groups.value.find((g) => results[g.kind]?.total)?.kind ?? groups.value[0]?.kind
  },
  set: (type) => router.replace({ query: { ...route.query, type } }),
})
const current = computed(() => (tab.value ? results[tab.value] : undefined))
const totalAll = computed(() => groups.value.reduce((sum, g) => sum + (results[g.kind]?.total ?? 0), 0))

function submit() {
  const text = input.value?.trim() ?? ''
  if (text !== q.value) router.replace({ query: { q: text || undefined, type: route.query.type } })
}

type Done = (status: 'ok' | 'empty' | 'error') => void
/** v-infinite-scroll: the next page of the open tab */
async function loadMore({ done }: { done: Done }) {
  await firstPages
  const kind = tab.value
  const text = q.value
  const group = groups.value.find((g) => g.kind === kind)
  const shown = kind ? results[kind] : undefined
  if (!group || !shown || !text) return done('empty')
  if (shown.hits.length >= shown.total) return done('empty')
  try {
    const page = await group.fetch(text, PAGE, shown.hits.length)
    if (q.value !== text || tab.value !== kind) return done('ok')
    shown.hits.push(...page.hits.filter((h) => !shown.hits.some((x) => x.key === h.key)))
    shown.total = page.total
    done(page.hits.length && shown.hits.length < shown.total ? 'ok' : 'empty')
  } catch {
    done('error')
  }
}
</script>

<template>
  <FoxPageHeader title="ผลการค้นหา" :breadcrumbs="[{ title: 'ค้นหา' }]" />

  <v-card class="fox-card-body">
    <v-text-field
      v-model="input"
      prepend-inner-icon="tabler:search"
      placeholder="ค้นหา Test Case, Requirement, Defect, รอบการทดสอบ, เอกสาร, โปรเจกต์"
      aria-label="คำค้นหา"
      hide-details
      clearable
      @keydown.enter="submit"
      @click:clear="router.replace({ query: {} })"
    />
    <p v-if="q && !loadingFirst" class="text-body-2 text-muted mt-3 mb-0">
      พบ <span class="fox-num">{{ totalAll }}</span> รายการที่ตรงกับ "{{ q }}"
    </p>
  </v-card>

  <v-card v-if="q" class="mt-4">
    <v-tabs v-model="tab" show-arrows>
      <v-tab v-for="g in groups" :key="g.kind" :value="g.kind" :prepend-icon="g.icon">
        {{ g.label }}
        <v-chip size="x-small" variant="tonal" class="ml-2 fox-num">{{ results[g.kind]?.total ?? '…' }}</v-chip>
      </v-tab>
    </v-tabs>
    <v-divider />

    <v-infinite-scroll :key="`${q}|${tab}`" side="end" @load="loadMore">
      <v-list class="px-2">
        <SearchHitItem v-for="hit in current?.hits ?? []" :key="hit.key" :hit="hit" @open="open" />
      </v-list>
      <template #loading>
        <v-progress-circular indeterminate color="primary" size="24" aria-label="กำลังโหลด" />
      </template>
      <template #empty>
        <span v-if="current?.total" class="text-caption text-muted fox-num">แสดงครบ {{ current.total }} รายการแล้ว</span>
        <FoxEmptyState v-else icon="tabler:search-off" title="ไม่พบผลลัพธ์ในหมวดนี้" text="ลองคำค้นอื่น หรือดูหมวดอื่น" />
      </template>
      <template #error="{ props }">
        <v-btn variant="text" color="primary" v-bind="props">โหลดไม่สำเร็จ ลองอีกครั้ง</v-btn>
      </template>
    </v-infinite-scroll>
  </v-card>

  <v-card v-else class="mt-4">
    <FoxEmptyState icon="tabler:search" title="พิมพ์คำที่ต้องการค้นหา" text="ค้นได้ทั้งรหัส ชื่อ และรายละเอียดของทุกโปรเจกต์ที่คุณเข้าถึงได้" />
  </v-card>
</template>
