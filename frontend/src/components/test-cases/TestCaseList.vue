<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import FoxTablePagination from '@/components/ui/FoxTablePagination.vue'
import TestCaseArchiveList from './TestCaseArchiveList.vue'
import TestCaseCard from './TestCaseCard.vue'
import TestCaseMoveControls from './TestCaseMoveControls.vue'
import TestCaseSubRow from './TestCaseSubRow.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useDragAutoScroll } from '@/composables/useDragAutoScroll'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { PRIORITIES, STATUSES, isHighChurn, isOverdue } from '@/services/test-case.service'
import { useRequirementStore } from '@/stores/requirement.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { MoveTarget, TestCase, TestCaseNode, TestCasePriority, TestCaseStatus } from '@/types'

const props = defineProps<{
  projectId: string
  cases: TestCaseNode[]
  /** archived cases of the project (archive view) */
  archived: TestCase[]
}>()
const emit = defineEmits<{
  create: []
  edit: [tc: TestCase]
  archive: [tc: TestCase]
  reviewed: [tc: TestCase]
  restore: [tc: TestCase]
  purge: [tc: TestCase]
  'add-subcase': [parentId: string]
  history: [tc: TestCase]
  extend: [tc: TestCase]
  clone: [tc: TestCase]
  'save-template': [tc: TestCase]
  reordered: [message: string]
}>()

const store = useTestCaseStore()
const requirementStore = useRequirementStore()
const { busy, run } = useAsyncAction()
const { canCreate, canReorder: mayReorder } = useTestCasePermissions()

// --- active cases / archive ----------------------------------------------------
const view = ref<'active' | 'archive'>('active')

// --- filters -----------------------------------------------------------------
type StatusFilter = TestCaseStatus | 'OVERDUE' | 'PING_PONG' | 'NEEDS_REVIEW'
const search = ref('')
const status = ref<StatusFilter | null>(null)
const priority = ref<TestCasePriority | null>(null)

const statusFilters = [
  { value: 'OVERDUE', label: 'เลยกำหนด (Overdue)', icon: 'tabler:clock-exclamation', tone: 'error' },
  { value: 'PING_PONG', label: 'แก้ซ้ำ > 1 รอบ', icon: 'tabler:flame', tone: 'caution' },
  { value: 'NEEDS_REVIEW', label: 'ต้องทบทวน (Requirement เปลี่ยน)', icon: 'tabler:alert-circle', tone: 'warning' },
  ...STATUSES,
]

function matches(tc: TestCase): boolean {
  const q = search.value?.trim().toLowerCase() ?? ''
  if (q && !`${tc.id} ${tc.name} ${requirementStore.textFor(tc)} ${tc.testScenario}`.toLowerCase().includes(q)) return false
  if (status.value === 'OVERDUE' && !isOverdue(tc)) return false
  if (status.value === 'PING_PONG' && !isHighChurn(tc)) return false
  if (status.value === 'NEEDS_REVIEW' && !tc.reviewNeeded) return false
  if (status.value && !['OVERDUE', 'PING_PONG', 'NEEDS_REVIEW'].includes(status.value) && tc.status !== status.value) return false
  if (priority.value && tc.priority !== priority.value) return false
  return true
}

const isFiltering = computed(() => !!(search.value || status.value || priority.value))
/** a parent stays visible when it or any of its sub-cases match */
const visible = computed(() => props.cases.filter((p) => matches(p) || p.subCases.some(matches)))

// --- pages: long lists render one page of parent cases at a time -----------------
// indexes stay positions in the whole list (`visible`), so moving and dropping work across pages
const page = ref(1)
const perPage = ref(20)
const pageStart = computed(() => (page.value - 1) * perPage.value)
const pageEnd = computed(() => Math.min(pageStart.value + perPage.value, visible.value.length))
const paged = computed(() => visible.value.slice(pageStart.value, pageEnd.value).map((parent, i) => ({ parent, pIdx: pageStart.value + i })))
watch([search, status, priority], () => (page.value = 1))
// the last page can empty out (archive, filters): step back
watch([pageStart, () => visible.value.length], ([start, count]) => {
  if (start > 0 && start >= count) page.value = Math.max(1, Math.ceil(count / perPage.value))
})

function resetFilters() {
  search.value = ''
  status.value = null
  priority.value = null
}

// --- collapse sub-cases --------------------------------------------------------
const collapsed = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

// --- drag & drop reordering (ids are renumbered after a drop) ----------------
type DragSource = { kind: 'parent'; index: number } | { kind: 'sub'; parentId: string; index: number }
/** insertion point: before item `index` of a list (`index === length` = at the end); list is 'parents' or a parent id */
type DropTarget = { list: string; index: number }

const dragging = ref<DragSource | null>(null)
const dropTarget = ref<DropTarget | null>(null)
// reordering renumbers ids, so it is an explicit mode (grips hidden otherwise) on the full, unfiltered list
const reorderMode = ref(false)
const canReorder = computed(() => mayReorder.value && reorderMode.value && !isFiltering.value)

function startReorder() {
  resetFilters()
  reorderMode.value = true
}

// Esc leaves reorder mode (the bottom bar also has "เสร็จสิ้น")
const onKeydown = (e: KeyboardEvent) => e.key === 'Escape' && !dragging.value && (reorderMode.value = false)
watch(reorderMode, (on) => (on ? window.addEventListener('keydown', onKeydown) : window.removeEventListener('keydown', onKeydown)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// scroll while dragging near the edges of the visible list: below the sticky header, above the reorder bar
const appBarHeight = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fox-appbar-height'), 10) || 72
const autoScroll = useDragAutoScroll({
  top: () => Math.max(appBarHeight(), document.querySelector('.fox-page-header--stuck')?.getBoundingClientRect().bottom ?? 0),
  bottom: () => document.querySelector('.tc-reorder-bar .v-snackbar__wrapper')?.getBoundingClientRect().top ?? window.innerHeight,
})

/** started from the grip handle; the whole card/row is used as the drag image */
function onDragStart(e: DragEvent, source: DragSource) {
  dragging.value = source
  autoScroll.start()
  if (!e.dataTransfer) return
  e.dataTransfer.setData('text/plain', JSON.stringify(source))
  e.dataTransfer.effectAllowed = 'move'
  const handle = e.currentTarget as HTMLElement
  const card = handle.closest<HTMLElement>(source.kind === 'parent' ? '.tc-slot' : '.tc-sub')
  if (card) {
    const box = card.getBoundingClientRect()
    e.dataTransfer.setDragImage(card, e.clientX - box.left, e.clientY - box.top)
  }
}

function onDragEnd() {
  dragging.value = null
  dropTarget.value = null
  autoScroll.stop()
}

/** the item whose upper half is under the pointer; past every item = the end of the list */
function insertIndex(e: DragEvent, selector: string): number {
  const items = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(`:scope > ${selector}`)]
  const i = items.findIndex((el) => {
    const box = el.getBoundingClientRect()
    return e.clientY < box.top + box.height / 2
  })
  return i === -1 ? items.length : i
}

function setDropTarget(list: string, index: number, from: number) {
  // right before or after itself would change nothing: show no line
  dropTarget.value = index === from || index === from + 1 ? null : { list, index }
}

// the whole list (gaps between cards included) is the drop zone
function onParentsDragOver(e: DragEvent) {
  const src = dragging.value
  if (src?.kind !== 'parent') {
    dropTarget.value = null
    return
  }
  e.preventDefault()
  setDropTarget('parents', pageStart.value + insertIndex(e, '.tc-slot'), src.index)
}

function onSubsDragOver(e: DragEvent, parentId: string) {
  const src = dragging.value
  if (src?.kind !== 'sub') return
  e.preventDefault()
  e.stopPropagation()
  setDropTarget(parentId, insertIndex(e, '.tc-sub'), src.parentId === parentId ? src.index : -1)
}

function onDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dropTarget.value = null
}

const tree = (): TestCaseNode[] => props.cases.map((p) => ({ ...p, subCases: [...p.subCases] }))

function onDrop() {
  const src = dragging.value
  const target = dropTarget.value
  onDragEnd()
  if (src && target) applyMove(src, target)
}

/** move a case to an insertion point (drag and drop and the move buttons); the store renumbers ids */
function applyMove(src: DragSource, target: DropTarget) {
  const list = tree()
  if (src.kind === 'parent') {
    const [moved] = list.splice(src.index, 1)
    list.splice(target.index > src.index ? target.index - 1 : target.index, 0, moved)
    run(
      () => store.reorder(props.projectId, list),
      () => emit('reordered', 'จัดลำดับ Test Case และรันรหัสใหม่แล้ว'),
    )
    return
  }
  const from = list.find((p) => p.id === src.parentId)
  const to = list.find((p) => p.id === target.list)
  if (!from || !to) return
  const [moved] = from.subCases.splice(src.index, 1)
  to.subCases.splice(from === to && target.index > src.index ? target.index - 1 : target.index, 0, moved)
  const parentNo = list.indexOf(to) + 101
  run(
    () => store.reorder(props.projectId, list),
    () => emit('reordered', `จัดลำดับ Sub-case และรันรหัสใหม่ (TC-${parentNo}-1 …) แล้ว`),
  )
}

function onSubsDrop(e: DragEvent) {
  if (dragging.value?.kind !== 'sub') return
  e.preventDefault()
  e.stopPropagation()
  onDrop()
}

// --- move buttons (reorder mode) ---------------------------------------------------
const parentTargets = computed<MoveTarget[]>(() => props.cases.map((p, index) => ({ id: p.id, name: p.name, list: 'parents', index })))
const subTargets = computed<MoveTarget[]>(() =>
  props.cases.flatMap((p) => p.subCases.map((s, index) => ({ id: s.id, name: s.name, list: p.id, index, group: `${p.id} ${p.name}` }))),
)

const moveParent = (index: number, to: DropTarget) => applyMove({ kind: 'parent', index }, to)
const moveSub = (parentId: string, index: number, to: DropTarget) => applyMove({ kind: 'sub', parentId, index }, to)

/** draws the insertion line above item `index`, or below the last item */
function insertClass(list: string, index: number, length: number) {
  const t = dropTarget.value
  if (t?.list !== list) return ''
  if (t.index === index) return 'tc-insert--before'
  return index === length - 1 && t.index === length ? 'tc-insert--after' : ''
}
</script>

<template>
  <div class="fox-stack">
    <!-- filters -->
    <v-card>
      <div class="fox-card-body">
        <v-btn-toggle
          v-if="archived.length || view === 'archive'"
          v-model="view"
          mandatory
          divided
          variant="outlined"
          color="primary"
          density="comfortable"
          class="mb-4"
          :disabled="reorderMode"
        >
          <v-btn value="active" prepend-icon="tabler:flask"
            >ใช้งานอยู่ <span class="fox-num ml-1">{{ cases.length }}</span></v-btn
          >
          <v-btn value="archive" prepend-icon="tabler:archive"
            >คลังเก็บ <span class="fox-num ml-1">{{ archived.length }}</span></v-btn
          >
        </v-btn-toggle>
        <p v-if="view === 'archive'" class="text-body-2 text-muted">
          เคสในคลังถูกซ่อนจากรายการ สถิติ Coverage และการสร้างรอบทดสอบ แต่ยังคงรหัสและประวัติไว้ กู้คืนหรือลบถาวรได้จากที่นี่
        </p>
        <v-row v-else dense class="row-gap-3 align-center">
          <v-col cols="12" md="5" lg="4">
            <v-text-field
              v-model="search"
              density="compact"
              placeholder="ค้นหา ID, ชื่อ, Requirement"
              prepend-inner-icon="tabler:search"
              aria-label="ค้นหา Test Case"
              clearable
              :disabled="reorderMode"
            />
          </v-col>
          <v-col cols="6" md="3">
            <v-select
              v-model="status"
              :items="statusFilters"
              item-title="label"
              item-value="value"
              density="compact"
              placeholder="ทุกสถานะ"
              aria-label="กรองสถานะ"
              clearable
              :disabled="reorderMode"
            >
              <template #item="{ props: item, item: { raw } }">
                <v-list-item v-bind="item" :prepend-icon="raw.icon" :base-color="raw.tone" />
              </template>
            </v-select>
          </v-col>
          <v-col cols="6" md="2">
            <v-select
              v-model="priority"
              :items="PRIORITIES"
              item-title="label"
              item-value="value"
              density="compact"
              placeholder="ทุก Priority"
              aria-label="กรอง Priority"
              clearable
              :disabled="reorderMode"
            >
              <template #item="{ props: item, item: { raw } }">
                <v-list-item v-bind="item" :prepend-icon="raw.icon" :base-color="raw.tone" />
              </template>
            </v-select>
          </v-col>
          <v-col cols="12" md="2" lg="3" class="text-md-end">
            <span class="text-body-2 text-muted">{{ visible.length }} จาก {{ cases.length }} เคสหลัก</span>
          </v-col>
        </v-row>
        <div v-if="view === 'archive'" />
        <div v-else-if="mayReorder && cases.length > 1 && !reorderMode" class="d-flex flex-wrap align-center ga-3 mt-3">
          <span class="text-body-2 text-muted flex-grow-1">เคสใหม่ต่อท้ายรายการ</span>
          <v-btn variant="outlined" size="small" prepend-icon="tabler:arrows-sort" @click="startReorder">จัดลำดับ</v-btn>
        </div>
      </div>
    </v-card>

    <!-- archive -->
    <TestCaseArchiveList
      v-if="view === 'archive'"
      :archived="archived"
      @edit="emit('edit', $event)"
      @restore="emit('restore', $event)"
      @purge="emit('purge', $event)"
    />

    <!-- parent cases -->
    <div
      v-else-if="visible.length"
      class="fox-stack"
      :class="{ 'tc-list--reordering': reorderMode }"
      @dragover="onParentsDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <div v-for="{ parent, pIdx } in paged" :key="parent.id" class="tc-slot" :class="insertClass('parents', pIdx, pageEnd)">
        <v-card class="tc-card" :class="{ 'tc-card--dragging': dragging?.kind === 'parent' && dragging.index === pIdx }">
          <TestCaseCard
            :test-case="parent"
            :reorder-mode="reorderMode"
            @edit="emit('edit', $event)"
            @history="emit('history', $event)"
            @extend="emit('extend', $event)"
            @clone="emit('clone', $event)"
            @save-template="emit('save-template', $event)"
            @archive="emit('archive', $event)"
            @reviewed="emit('reviewed', $event)"
            @add-subcase="emit('add-subcase', $event)"
          >
            <template v-if="canReorder" #grip>
              <span
                class="tc-grip text-muted mt-1"
                draggable="true"
                title="ลากเพื่อจัดลำดับ"
                aria-label="ลากเพื่อจัดลำดับ"
                @dragstart="onDragStart($event, { kind: 'parent', index: pIdx })"
                @dragend="onDragEnd"
              >
                <v-icon icon="tabler:grip-vertical" />
              </span>
            </template>
            <template v-if="canReorder" #move>
              <TestCaseMoveControls
                list="parents"
                :index="pIdx"
                :count="visible.length"
                :targets="parentTargets.filter((t) => t.index !== pIdx)"
                @move="moveParent(pIdx, $event)"
              />
            </template>
          </TestCaseCard>

          <!-- sub-cases -->
          <template v-if="parent.subCases.length">
            <v-divider />
            <div class="px-4 py-3 tc-subs">
              <button type="button" class="tc-subs__toggle text-body-2" :aria-expanded="!collapsed.has(parent.id)" @click="toggle(parent.id)">
                <v-icon :icon="collapsed.has(parent.id) ? 'tabler:chevron-right' : 'tabler:chevron-down'" size="18" />
                Sub-cases ({{ parent.subCases.length }})
              </button>
              <v-expand-transition>
                <div v-show="!collapsed.has(parent.id)">
                  <div class="d-flex flex-column ga-2 mt-2" @dragover="onSubsDragOver($event, parent.id)" @drop="onSubsDrop">
                    <TestCaseSubRow
                      v-for="(sub, sIdx) in parent.subCases"
                      :key="sub.id"
                      :test-case="sub"
                      :reorder-mode="reorderMode"
                      :class="[
                        insertClass(parent.id, sIdx, parent.subCases.length),
                        { 'tc-card--dragging': dragging?.kind === 'sub' && dragging.parentId === parent.id && dragging.index === sIdx },
                      ]"
                      @edit="emit('edit', $event)"
                      @history="emit('history', $event)"
                      @archive="emit('archive', $event)"
                      @reviewed="emit('reviewed', $event)"
                    >
                      <template v-if="canReorder" #grip>
                        <span
                          class="tc-grip text-muted"
                          draggable="true"
                          title="ลากเพื่อจัดลำดับ"
                          aria-label="ลากเพื่อจัดลำดับ"
                          @dragstart.stop="onDragStart($event, { kind: 'sub', parentId: parent.id, index: sIdx })"
                          @dragend.stop="onDragEnd"
                        >
                          <v-icon icon="tabler:grip-vertical" size="18" />
                        </span>
                      </template>
                      <template v-if="canReorder" #move>
                        <TestCaseMoveControls
                          compact
                          :list="parent.id"
                          :index="sIdx"
                          :count="parent.subCases.length"
                          :targets="subTargets.filter((t) => !(t.list === parent.id && t.index === sIdx))"
                          @move="moveSub(parent.id, sIdx, $event)"
                        />
                      </template>
                    </TestCaseSubRow>
                  </div>
                </div>
              </v-expand-transition>
            </div>
          </template>
        </v-card>
      </div>
      <v-card v-if="visible.length > 10">
        <FoxTablePagination
          v-model:page="page"
          v-model:items-per-page="perPage"
          :total="visible.length"
          :options="[10, 20, 50, 100]"
          class="fox-card-body py-3"
        />
      </v-card>
    </div>

    <!-- empty -->
    <v-card v-else>
      <FoxEmptyState
        icon="tabler:flask"
        :title="isFiltering ? 'ไม่พบ Test Case ตามเงื่อนไข' : 'ยังไม่มี Test Case ในโปรเจกต์นี้'"
        :text="isFiltering ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง' : 'เริ่มจากสร้าง Test Case แรกของคุณ'"
      >
        <v-btn v-if="isFiltering" class="mt-3" variant="tonal" color="primary" @click="resetFilters">ล้างตัวกรอง</v-btn>
        <v-btn v-else-if="canCreate" class="mt-3" color="primary" prepend-icon="tabler:plus" @click="emit('create')">สร้าง Test Case</v-btn>
      </FoxEmptyState>
    </v-card>

    <!-- reorder mode: stays at the bottom of the screen until "เสร็จสิ้น" / Esc -->
    <v-snackbar :model-value="reorderMode" :timeout="-1" location="bottom" class="tc-reorder-bar" max-width="760">
      <div class="d-flex align-center ga-3">
        <v-progress-circular v-if="busy" indeterminate size="22" width="2" />
        <v-icon v-else icon="tabler:arrows-sort" />
        <div>
          <div class="text-subtitle-2">โหมดจัดเรียง{{ busy ? ' · กำลังบันทึกลำดับ' : '' }}</div>
          <div class="text-caption">
            ลากที่ <v-icon icon="tabler:grip-vertical" size="14" /> หรือใช้ปุ่มย้ายมุมขวาบนของการ์ด รหัสจะรันใหม่ทันที · กด Esc เพื่อออก
          </div>
        </div>
      </div>
      <template #actions>
        <v-btn color="primary" variant="flat" prepend-icon="tabler:check" @click="reorderMode = false">เสร็จสิ้น</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<style scoped>
.tc-card {
  transition:
    opacity 0.15s,
    box-shadow 0.15s;
}

.tc-list--reordering {
  /* room for the reorder bar at the bottom of the screen */
  padding-bottom: 88px;
}

.tc-card--dragging {
  opacity: 0.4;
}

/* insertion line, drawn in the gap between cards (24px) / sub-case rows (8px) */
.tc-slot,
.tc-sub {
  position: relative;
}

.tc-insert--before::before,
.tc-insert--after::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  height: 4px;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
  pointer-events: none;
}

.tc-slot.tc-insert--before::before {
  top: calc(var(--fox-gutter) / -2 - 2px);
}

.tc-slot.tc-insert--after::after {
  bottom: calc(var(--fox-gutter) / -2 - 2px);
}

.tc-sub.tc-insert--before::before {
  top: -6px;
}

.tc-sub.tc-insert--after::after {
  bottom: -6px;
}

.tc-grip {
  display: inline-flex;
  flex: none;
  border-radius: 4px;
  cursor: grab;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.tc-grip:hover {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.tc-grip:active {
  cursor: grabbing;
}

.tc-subs {
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.tc-subs__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  color: rgb(var(--v-theme-muted));
}
</style>
