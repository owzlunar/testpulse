<script setup lang="ts">
import { computed, ref } from 'vue'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import UserAvatar from '@/components/users/UserAvatar.vue'
import TestCaseBadges from './TestCaseBadges.vue'
import TestCasePriorityChip from './TestCasePriorityChip.vue'
import TestCaseStatusChip from './TestCaseStatusChip.vue'
import TestCaseStatusMenu from './TestCaseStatusMenu.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { PRIORITIES, STATUSES, isDueSoon, isHighChurn, isOverdue } from '@/services/test-case.service'
import { useRequirementStore } from '@/stores/requirement.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase, TestCaseNode, TestCasePriority, TestCaseStatus } from '@/types'
import { formatDateTH, formatDateTime } from '@/utils/date'
import { firstName } from '@/utils/format'

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
const { run } = useAsyncAction()
const { canCreate, canEdit, canDelete, canHandOff } = useTestCasePermissions()

// --- active cases / archive ----------------------------------------------------
const view = ref<'active' | 'archive'>('active')

// --- filters -----------------------------------------------------------------
type StatusFilter = TestCaseStatus | 'OVERDUE' | 'PING_PONG'
const search = ref('')
const status = ref<StatusFilter | null>(null)
const priority = ref<TestCasePriority | null>(null)

const statusFilters = [
  { value: 'OVERDUE', label: 'เลยกำหนด (Overdue)', icon: 'tabler:clock-exclamation', tone: 'error' },
  { value: 'PING_PONG', label: 'แก้ซ้ำ > 1 รอบ', icon: 'tabler:flame', tone: 'caution' },
  ...STATUSES,
]

function matches(tc: TestCase): boolean {
  const q = search.value?.trim().toLowerCase() ?? ''
  if (q && !`${tc.id} ${tc.name} ${requirementStore.textFor(tc)} ${tc.testScenario}`.toLowerCase().includes(q)) return false
  if (status.value === 'OVERDUE' && !isOverdue(tc)) return false
  if (status.value === 'PING_PONG' && !isHighChurn(tc)) return false
  if (status.value && status.value !== 'OVERDUE' && status.value !== 'PING_PONG' && tc.status !== status.value) return false
  if (priority.value && tc.priority !== priority.value) return false
  return true
}

const isFiltering = computed(() => !!(search.value || status.value || priority.value))
/** a parent stays visible when it or any of its sub-cases match */
const visible = computed(() => props.cases.filter((p) => matches(p) || p.subCases.some(matches)))

function resetFilters() {
  search.value = ''
  status.value = null
  priority.value = null
}

// --- collapse sub-cases --------------------------------------------------------
const collapsed = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(collapsed.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsed.value = next
}

// --- status -------------------------------------------------------------------
const setStatus = (tc: TestCase, s: TestCaseStatus) => run(() => store.update(tc.id, { status: s }, tc.projectId))

// --- drag & drop reordering (ids are renumbered after a drop) ----------------
type DragSource = { kind: 'parent'; index: number } | { kind: 'sub'; parentId: string; index: number }
/** insertion point: before item `index` of a list (`index === length` = at the end); list is 'parents' or a parent id */
type DropTarget = { list: string; index: number }

const dragging = ref<DragSource | null>(null)
const dropTarget = ref<DropTarget | null>(null)
// reordering renumbers ids, so it is an explicit mode (grips hidden otherwise) on the full, unfiltered list
const reorderMode = ref(false)
const canReorder = computed(() => canEdit.value && reorderMode.value && !isFiltering.value)

function startReorder() {
  resetFilters()
  reorderMode.value = true
}

/** started from the grip handle; the whole card/row is used as the drag image */
function onDragStart(e: DragEvent, source: DragSource) {
  dragging.value = source
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
  setDropTarget('parents', insertIndex(e, '.tc-slot'), src.index)
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
  if (!src || !target) return
  const list = tree()
  if (src.kind === 'parent') {
    const [moved] = list.splice(src.index, 1)
    list.splice(target.index > src.index ? target.index - 1 : target.index, 0, moved)
    run(() => store.reorder(props.projectId, list), () => emit('reordered', 'จัดลำดับ Test Case และรันรหัสใหม่แล้ว'))
    return
  }
  const from = list.find((p) => p.id === src.parentId)
  const to = list.find((p) => p.id === target.list)
  if (!from || !to) return
  const [moved] = from.subCases.splice(src.index, 1)
  to.subCases.splice(from === to && target.index > src.index ? target.index - 1 : target.index, 0, moved)
  const parentNo = list.indexOf(to) + 101
  run(() => store.reorder(props.projectId, list), () => emit('reordered', `จัดลำดับ Sub-case และรันรหัสใหม่ (TC-${parentNo}-1 …) แล้ว`))
}

function onSubsDrop(e: DragEvent) {
  if (dragging.value?.kind !== 'sub') return
  e.preventDefault()
  e.stopPropagation()
  onDrop()
}

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
          <v-btn value="active" prepend-icon="tabler:flask">ใช้งานอยู่ <span class="fox-num ml-1">{{ cases.length }}</span></v-btn>
          <v-btn value="archive" prepend-icon="tabler:archive">คลังเก็บ <span class="fox-num ml-1">{{ archived.length }}</span></v-btn>
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
        <div v-else-if="canEdit && reorderMode" class="d-flex flex-wrap align-center ga-3 mt-3">
          <v-icon icon="tabler:arrows-sort" color="primary" size="18" />
          <span class="text-body-2 text-muted flex-grow-1">ลากการ์ดหรือ Sub-case ด้วยปุ่ม <v-icon icon="tabler:grip-vertical" size="16" /> ไปวางตำแหน่งที่ต้องการ ระบบจะรันรหัส TC-101, TC-102 … ใหม่ทันทีที่วาง</span>
          <v-btn color="primary" size="small" prepend-icon="tabler:check" @click="reorderMode = false">เสร็จสิ้น</v-btn>
        </div>
        <div v-else-if="canEdit && cases.length > 1" class="d-flex flex-wrap align-center ga-3 mt-3">
          <span class="text-body-2 text-muted flex-grow-1">เคสใหม่ต่อท้ายรายการ</span>
          <v-btn variant="outlined" size="small" prepend-icon="tabler:arrows-sort" @click="startReorder">จัดลำดับ</v-btn>
        </div>
      </div>
    </v-card>

    <!-- archive -->
    <v-card v-if="view === 'archive'">
      <FoxEmptyState v-if="!archived.length" icon="tabler:archive" title="คลังเก็บว่าง" text="เคสที่เก็บเข้าคลังจะแสดงที่นี่" />
      <div v-else class="d-flex flex-column">
        <template v-for="(tc, i) in archived" :key="tc.id">
          <v-divider v-if="i" />
          <div class="d-flex flex-wrap align-center ga-3 fox-card-body py-4">
            <v-icon icon="tabler:archive" class="text-muted" />
            <div class="flex-grow-1 overflow-hidden">
              <div class="text-subtitle-2 text-truncate"><span class="text-primary fox-num mr-2">{{ tc.id }}</span>{{ tc.name }}</div>
              <div class="text-caption text-muted">
                <template v-if="tc.parentId">Sub-case ของ {{ tc.parentId }} · </template>
                {{ tc.version }} · เก็บเมื่อ {{ formatDateTime(tc.archivedAt!) }}<template v-if="tc.archivedBy"> โดย {{ tc.archivedBy }}</template>
              </div>
            </div>
            <div class="d-flex align-center ga-1 flex-shrink-0">
              <v-btn icon="tabler:eye" variant="text" size="small" :aria-label="`ดู ${tc.id}`" @click="emit('edit', tc)" />
              <template v-if="canDelete">
                <v-btn variant="tonal" color="primary" size="small" prepend-icon="tabler:archive-off" @click="emit('restore', tc)">กู้คืน</v-btn>
                <v-btn icon="tabler:trash" variant="text" size="small" color="error" :aria-label="`ลบถาวร ${tc.id}`" @click="emit('purge', tc)" />
              </template>
            </div>
          </div>
        </template>
      </div>
    </v-card>

    <!-- parent cases -->
    <div v-else-if="visible.length" class="fox-stack" @dragover="onParentsDragOver" @dragleave="onDragLeave" @drop.prevent="onDrop">
      <div
        v-for="(parent, pIdx) in visible"
        :key="parent.id"
        class="tc-slot"
        :class="insertClass('parents', pIdx, visible.length)"
      >
        <v-card class="tc-card" :class="{ 'tc-card--dragging': dragging?.kind === 'parent' && dragging.index === pIdx }">
          <div class="fox-card-body">
            <div class="d-flex align-start ga-3">
              <span
                v-if="canReorder"
                class="tc-grip text-muted mt-1"
                draggable="true"
                title="ลากเพื่อจัดลำดับ"
                aria-label="ลากเพื่อจัดลำดับ"
                @dragstart="onDragStart($event, { kind: 'parent', index: pIdx })"
                @dragend="onDragEnd"
              >
                <v-icon icon="tabler:grip-vertical" />
              </span>
              <div class="flex-grow-1 overflow-hidden">
                <div class="d-flex flex-wrap align-center ga-2 mb-2">
                  <v-chip color="primary" size="small" variant="flat" class="fox-num">{{ parent.id }}</v-chip>
                  <span class="text-caption text-muted fox-num">{{ parent.version }}</span>
                  <TestCaseStatusChip :status="parent.status" />
                  <TestCasePriorityChip :priority="parent.priority" />
                  <TestCaseBadges :test-case="parent" />
                </div>
                <h3 class="text-h6 mb-1">{{ parent.name }}</h3>
                <dl class="tc-spec text-body-2">
                  <dt class="text-muted">Requirement</dt>
                  <dd class="fox-clamp-2 tc-pre">{{ requirementStore.textFor(parent) || '-' }}</dd>
                  <dt class="text-muted">Scenario</dt>
                  <dd class="fox-clamp-2">{{ parent.testScenario }}</dd>
                </dl>
              </div>
            </div>

            <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-4">
              <div class="d-flex flex-wrap align-center ga-4 text-body-2 text-muted">
                <span class="d-inline-flex align-center ga-1"><v-icon icon="tabler:list-check" size="16" />{{ parent.steps.length }} ขั้นตอน</span>
                <span v-if="parent.expectedImages.length + parent.actualImages.length" class="d-inline-flex align-center ga-1">
                  <v-icon icon="tabler:photo" size="16" />{{ parent.expectedImages.length + parent.actualImages.length }} ภาพ
                </span>
                <span
                  class="d-inline-flex align-center ga-1"
                  :class="{ 'text-error': isOverdue(parent), 'text-warning': isDueSoon(parent) }"
                >
                  <v-icon icon="tabler:calendar-due" size="16" />{{ formatDateTH(parent.expiryDate) }}
                </span>
                <span v-if="parent.assignedDev" class="d-inline-flex align-center ga-1">
                  <v-icon icon="tabler:code" size="16" />{{ firstName(parent.assignedDev) }}
                </span>
                <span v-if="parent.activeUser" class="d-inline-flex align-center ga-2">
                  <span class="tc-presence" />
                  <UserAvatar :user="parent.activeUser" size="20" />
                  {{ firstName(parent.activeUser.name) }} {{ parent.activeUser.action === 'editing' ? 'แก้ไขล่าสุด' : 'กำลังดู' }}
                </span>
              </div>

              <div class="d-flex flex-wrap align-center ga-2">
                <v-btn
                  v-if="parent.status === 'pending' && canHandOff"
                  color="info"
                  size="small"
                  prepend-icon="tabler:send"
                  @click="setStatus(parent, 'ready_for_test')"
                >
                  ส่งมอบพร้อมเทส
                </v-btn>
                <TestCaseStatusMenu :status="parent.status" @change="setStatus(parent, $event)" />
                <v-btn v-if="canCreate" variant="tonal" size="small" prepend-icon="tabler:subtask" @click="emit('add-subcase', parent.id)">Sub-case</v-btn>
                <v-btn icon="tabler:pencil" variant="text" size="small" color="primary" :aria-label="`เปิด ${parent.id}`" @click="emit('edit', parent)" />
                <v-menu location="bottom end">
                  <template #activator="{ props: menu }">
                    <v-btn v-bind="menu" icon="tabler:dots-vertical" variant="text" size="small" :aria-label="`ตัวเลือก ${parent.id}`" />
                  </template>
                  <v-list>
                    <v-list-item prepend-icon="tabler:history" title="ประวัติและ Audit" @click="emit('history', parent)" />
                    <v-list-item prepend-icon="tabler:calendar-time" title="ขอขยายเวลา" @click="emit('extend', parent)" />
                    <template v-if="canCreate">
                      <v-list-item prepend-icon="tabler:copy" title="ทำสำเนา (Clone)" @click="emit('clone', parent)" />
                      <v-list-item prepend-icon="tabler:template" title="บันทึกเป็น Template" @click="emit('save-template', parent)" />
                    </template>
                    <template v-if="canDelete">
                      <v-divider class="my-1" />
                      <v-list-item prepend-icon="tabler:archive" title="เก็บเข้าคลัง" @click="emit('archive', parent)" />
                    </template>
                  </v-list>
                </v-menu>
              </div>
            </div>
          </div>

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
                    <div
                      v-for="(sub, sIdx) in parent.subCases"
                      :key="sub.id"
                      class="tc-sub"
                      :class="[
                        insertClass(parent.id, sIdx, parent.subCases.length),
                        { 'tc-card--dragging': dragging?.kind === 'sub' && dragging.parentId === parent.id && dragging.index === sIdx },
                      ]"
                    >
                      <span
                        v-if="canReorder"
                        class="tc-grip text-muted"
                        draggable="true"
                        title="ลากเพื่อจัดลำดับ"
                        aria-label="ลากเพื่อจัดลำดับ"
                        @dragstart.stop="onDragStart($event, { kind: 'sub', parentId: parent.id, index: sIdx })"
                        @dragend.stop="onDragEnd"
                      >
                        <v-icon icon="tabler:grip-vertical" size="18" />
                      </span>
                      <div class="flex-grow-1 overflow-hidden">
                        <div class="d-flex flex-wrap align-center ga-2">
                          <span class="text-subtitle-2 text-primary fox-num">{{ sub.id }}</span>
                          <TestCaseStatusChip :status="sub.status" size="x-small" />
                          <TestCasePriorityChip :priority="sub.priority" />
                          <TestCaseBadges :test-case="sub" />
                        </div>
                        <div class="text-body-2 text-truncate">{{ sub.name }}</div>
                      </div>
                      <div class="d-flex align-center ga-1 flex-shrink-0">
                        <TestCaseStatusMenu :status="sub.status" size="x-small" @change="setStatus(sub, $event)" />
                        <v-btn icon="tabler:history" variant="text" size="x-small" :aria-label="`ประวัติ ${sub.id}`" @click="emit('history', sub)" />
                        <v-btn icon="tabler:pencil" variant="text" size="x-small" color="primary" :aria-label="`เปิด ${sub.id}`" @click="emit('edit', sub)" />
                        <v-btn
                          v-if="canDelete"
                          icon="tabler:archive"
                          variant="text"
                          size="x-small"
                          :aria-label="`เก็บ ${sub.id} เข้าคลัง`"
                          @click="emit('archive', sub)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </v-expand-transition>
            </div>
          </template>
        </v-card>
      </div>
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
  </div>
</template>

<style scoped>
.tc-card {
  transition: opacity 0.15s, box-shadow 0.15s;
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
  transition: background-color 0.15s, color 0.15s;
}

.tc-grip:hover {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.tc-grip:active {
  cursor: grabbing;
}

.tc-spec {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  margin: 0;
}

.tc-spec dd {
  margin: 0;
}

.tc-pre {
  white-space: pre-line;
}

.tc-presence {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 3px rgba(var(--v-theme-success), 0.2);
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

.tc-sub {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--fox-radius-control);
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@media (max-width: 599.98px) {
  .tc-spec {
    grid-template-columns: 1fr;
  }

  .tc-sub {
    flex-wrap: wrap;
  }
}
</style>
