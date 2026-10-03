<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import FoxCardHeader from '@/components/ui/FoxCardHeader.vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import { apiOn } from '@/api'
import { useAuthStore } from '@/stores/auth.store'
import { useDefectStore } from '@/stores/defect.store'
import { useDocumentStore } from '@/stores/document.store'
import { useProjectStore } from '@/stores/project.store'
import { useRunStore } from '@/stores/run.store'
import type { Tone } from '@/types'
import { isOpenDefect } from '@/domain/defect'
import { runCounts } from '@/domain/run'
import { isOverdue } from '@/domain/test-case'

// "What should I do next" for the current role, across cases, runs, defects and documents
const auth = useAuthStore()
const { currentUser } = storeToRefs(auth)
const { currentCases } = storeToRefs(useProjectStore())
const runStore = useRunStore()
const defectStore = useDefectStore()
const documentStore = useDocumentStore()

// runs, defects and documents count once the backend has them (apiOn)
const sources = [
  { on: apiOn.run, store: runStore },
  { on: apiOn.defect, store: defectStore },
  { on: apiOn.document, store: documentStore },
].filter((s) => s.on)
onMounted(() => Promise.all(sources.map((s) => s.store.ensureLoaded())).catch(() => {}))
const ready = computed(() => sources.every((s) => s.store.loaded))
const runs = computed(() => (apiOn.run ? runStore.current : []))
const defects = computed(() => (apiOn.defect ? defectStore.current : []))
const documents = computed(() => (apiOn.document ? documentStore.current : []))

interface Todo {
  icon: string
  tone: Tone
  title: string
  text: string
  to: string | { path: string; query?: Record<string, string> }
}

const todos = computed<Todo[]>(() => {
  const me = currentUser.value.name
  const list: Todo[] = []
  // by what the role may do: testers get QA work, developers get fixes; Admin sees everyone's
  const isQa = auth.can('run.execute')
  const isDev = auth.can('case.handoff')
  const everyone = auth.isAdmin

  if (isQa) {
    const ready = currentCases.value.filter((c) => c.status === 'ready_for_test')
    if (ready.length)
      list.push({
        icon: 'tabler:send',
        tone: 'info',
        title: `${ready.length} เคสพร้อมให้ทดสอบ`,
        text: ready.map((c) => c.id).join(', '),
        to: '/test-cases',
      })
    runs.value
      .filter((r) => r.status !== 'completed')
      .forEach((r) => {
        const left = runCounts(r).untested
        if (left)
          list.push({
            icon: 'tabler:player-play',
            tone: 'warning',
            title: `${r.name} #${r.round} เหลือ ${left} เคส`,
            text: `${r.environment} · ทดสอบแล้ว ${runCounts(r).executed}/${runCounts(r).total}`,
            to: `/test-runs/${r.id}`,
          })
      })
    const retest = defects.value.filter((d) => d.status === 'retest')
    if (retest.length)
      list.push({
        icon: 'tabler:refresh',
        tone: 'warning',
        title: `${retest.length} Defect รอทดสอบซ้ำ`,
        text: retest.map((d) => d.id).join(', '),
        to: '/defects',
      })
  }
  if (isDev) {
    const mine = currentCases.value.filter((c) => (c.status === 'pending' || c.status === 'failed') && (everyone || c.assignedDev === me))
    if (mine.length)
      list.push({
        icon: 'tabler:code',
        tone: 'primary',
        title: `${mine.length} เคสรอ Dev`,
        text: mine.map((c) => c.id).join(', '),
        to: '/test-cases',
      })
    const bugs = defects.value.filter((d) => isOpenDefect(d) && d.status !== 'retest' && (everyone || d.assignee === me))
    if (bugs.length)
      list.push({
        icon: 'tabler:bug',
        tone: 'error',
        title: `${bugs.length} Defect ที่ต้องแก้`,
        text: bugs.map((d) => d.id).join(', '),
        to: '/defects',
      })
  }
  const overdue = currentCases.value.filter(isOverdue)
  if (overdue.length)
    list.push({
      icon: 'tabler:clock-exclamation',
      tone: 'error',
      title: `${overdue.length} เคสเลยกำหนด`,
      text: 'ขอขยายเวลาหรือเร่งดำเนินการ',
      to: '/calendar',
    })
  const waiting = documents.value.filter((d) => d.status === 'pending_signoff')
  if (waiting.length)
    list.push({
      icon: 'tabler:signature',
      tone: 'success',
      title: `${waiting.length} เอกสารรอลงนาม`,
      text: waiting.map((d) => d.docNumber).join(', '),
      to: `/documents/${waiting[0].id}`,
    })
  return list
})
</script>

<template>
  <v-card class="fox-card-body h-100">
    <FoxCardHeader title="สิ่งที่ต้องทำ" :subtitle="`สำหรับ ${auth.roleOf(currentUser).label}`" />
    <div v-if="!ready" class="mt-4"><v-skeleton-loader v-for="i in 3" :key="i" type="list-item-avatar-two-line" /></div>
    <div v-else-if="todos.length" class="d-flex flex-column ga-1 mt-4">
      <router-link v-for="t in todos" :key="t.title" :to="t.to" class="todo-item">
        <v-avatar :color="t.tone" rounded="lg" size="40"><v-icon :icon="t.icon" size="20" /></v-avatar>
        <span class="overflow-hidden flex-grow-1">
          <span class="d-block text-subtitle-2 text-truncate">{{ t.title }}</span>
          <span class="d-block text-caption text-muted text-truncate">{{ t.text }}</span>
        </span>
        <v-icon icon="tabler:chevron-right" size="18" class="text-muted" />
      </router-link>
    </div>
    <FoxEmptyState v-else icon="tabler:mood-happy" title="ไม่มีงานค้าง" text="ทุกอย่างเรียบร้อยในโปรเจกต์นี้" />
  </v-card>
</template>

<style scoped>
.todo-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: var(--fox-radius-control);
  color: inherit;
  text-decoration: none;
  transition: background-color 0.15s;
}

.todo-item:hover,
.todo-item:focus-visible {
  background: rgba(var(--v-theme-primary), 0.06);
  outline: none;
}
</style>
