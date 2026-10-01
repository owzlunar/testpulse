<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import FoxPageHeader from '@/components/ui/FoxPageHeader.vue'
import FoxStatCard from '@/components/ui/FoxStatCard.vue'
import FoxCalendar from '@/components/FoxCalendar.vue'
import ExtendDueDateDialog from '@/components/test-cases/ExtendDueDateDialog.vue'
import { useCalendarStore, type CalendarItem, type QuickFilter } from '@/stores/calendar.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useProjectStore } from '@/stores/project.store'
import { useSnackbar } from '@/composables/useSnackbar'
import { milestoneTypeOf } from '@/services/project.service'
import { isHighChurn, isOverdue, statusOf } from '@/services/test-case.service'
import type { CalendarEventChange, Tone } from '@/types'
import { formatDateTH } from '@/utils/date'
import { firstName, formatPercent } from '@/utils/format'

const calendar = useCalendarStore()
const { quickFilter, devFilter, rootCauseFilter, extend } = storeToRefs(calendar)
const layout = useLayoutStore()
const { currentCases, currentStats } = storeToRefs(useProjectStore())
const { lgAndUp, xs } = useDisplay()
const { snackbar, notify } = useSnackbar()

const avgChurn = computed(() => {
  const cases = calendar.churnCases
  return cases.length ? (cases.reduce((sum, c) => sum + (c.churnCount ?? 0), 0) / cases.length).toFixed(1) : '0'
})

const stats = computed(() => [
  { label: `Test Cases · ผ่าน ${formatPercent(currentStats.value.passRate, 0)}`, value: currentCases.value.length, icon: 'tabler:calendar-check', tone: 'primary' as Tone },
  { label: `แก้ซ้ำ > 1 รอบ · เฉลี่ย ${avgChurn.value} รอบ`, value: calendar.churnCases.length, icon: 'tabler:flame', tone: 'caution' as Tone },
  { label: 'เลยกำหนด SLA', value: calendar.overdueCases.length, icon: 'tabler:clock-exclamation', tone: 'error' as Tone },
  {
    label: calendar.nextMilestone ? `${calendar.nextMilestone.title} · ${formatDateTH(calendar.nextMilestone.date)}` : 'ไม่มี Milestone ที่กำลังจะมาถึง',
    value: calendar.nextMilestone ? milestoneTypeOf(calendar.nextMilestone.type).label : '-',
    icon: 'tabler:flag',
    tone: 'info' as Tone,
  },
])

const quickFilters: { value: QuickFilter; label: string; icon: string; tone: Tone }[] = [
  { value: 'ALL', label: 'ทั้งหมด', icon: 'tabler:list', tone: 'primary' },
  { value: 'PING_PONG', label: 'แก้ซ้ำ', icon: 'tabler:flame', tone: 'caution' },
  { value: 'OVERDUE', label: 'เลยกำหนด', icon: 'tabler:clock-exclamation', tone: 'error' },
  { value: 'FAILED', label: 'Failed', icon: 'tabler:circle-x', tone: 'error' },
  { value: 'PENDING', label: 'รอ Dev', icon: 'tabler:code', tone: 'primary' },
  { value: 'READY', label: 'พร้อมเทส', icon: 'tabler:send', tone: 'info' },
  { value: 'PASSED', label: 'Passed', icon: 'tabler:circle-check', tone: 'success' },
]

// on tablet/phone the detail sidebar is an overlay: open it when something is picked
const reveal = () => {
  if (!lgAndUp.value) layout.asideOpen = true
}

function onEventClick(id: string) {
  calendar.selectEvent(id)
  reveal()
}

function onDateClick(date: string) {
  calendar.selectDate(date)
  reveal()
}

// dragging a case = reschedule request: undo the move and ask for a reason first
function onEventChange({ id, start, revert }: CalendarEventChange) {
  revert()
  calendar.openExtend(id, start)
}

const extendCase = computed(() => currentCases.value.find((c) => c.id === extend.value.caseId) ?? null)

function caseOf(item: CalendarItem | undefined) {
  return item?.kind === 'case' ? item.testCase : null
}
</script>

<template>
  <FoxPageHeader title="ปฏิทินงานทดสอบ" :breadcrumbs="[{ title: 'ปฏิทิน' }]">
    <template #actions>
      <v-btn variant="outlined" :icon="xs" aria-label="แถบรายละเอียด" @click="layout.toggleAside()">
        <v-icon icon="tabler:layout-sidebar-right" :start="!xs" />
        <span v-if="!xs">{{ layout.asideOpen ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด' }}</span>
      </v-btn>
    </template>
  </FoxPageHeader>

  <div class="fox-stack">
    <v-row class="fox-grid">
      <v-col v-for="s in stats" :key="s.icon" cols="12" sm="6" xl="3">
        <FoxStatCard v-bind="s" />
      </v-col>
    </v-row>

    <!-- filters -->
    <v-card class="fox-card-body">
      <div class="d-flex flex-wrap align-center justify-space-between ga-3">
        <v-chip-group v-model="quickFilter" mandatory column aria-label="ตัวกรองด่วน">
          <v-chip v-for="f in quickFilters" :key="f.value" :value="f.value" :color="f.tone" :prepend-icon="f.icon" variant="tonal" filter>
            {{ f.label }} <span class="fox-num ml-1">{{ calendar.countOf(f.value) }}</span>
          </v-chip>
        </v-chip-group>
        <div class="d-flex flex-wrap ga-2 calendar-filters">
          <v-select v-model="devFilter" :items="calendar.devOptions" density="compact" placeholder="Developer ทั้งหมด" aria-label="กรองตาม Developer" clearable />
          <v-select v-model="rootCauseFilter" :items="calendar.rootCauseOptions" density="compact" placeholder="ทุก Root Cause" aria-label="กรองตาม Root Cause" clearable />
        </div>
      </div>
      <div v-if="calendar.milestones.length" class="d-flex flex-wrap align-center ga-2 mt-4">
        <span class="text-body-2 text-muted mr-1">Milestones:</span>
        <v-chip
          v-for="m in calendar.milestones"
          :key="m.id"
          :color="milestoneTypeOf(m.type).tone"
          :prepend-icon="milestoneTypeOf(m.type).icon"
          size="small"
          variant="tonal"
          @click="onEventClick(`ms-${m.id}`)"
        >
          {{ formatDateTH(m.date, { day: 'numeric', month: 'short' }) }} · {{ m.title }}
        </v-chip>
      </div>
    </v-card>

    <FoxCalendar
      :events="calendar.events"
      :selected-id="calendar.selectedEventId"
      @event-click="onEventClick"
      @date-click="onDateClick"
      @event-change="onEventChange"
    >
      <template #event="{ event }">
        <span v-if="event.data?.kind === 'milestone'" class="cal-pill">
          <v-icon :icon="milestoneTypeOf(event.data.milestone.type).icon" size="12" />
          <span class="text-truncate">{{ event.title }}</span>
        </span>
        <span v-else-if="caseOf(event.data)" class="cal-pill">
          <v-icon :icon="statusOf(caseOf(event.data)!.status).icon" size="12" />
          <strong class="fox-num">{{ event.id }}</strong>
          <span class="text-truncate">{{ caseOf(event.data)!.name }}</span>
          <v-icon v-if="isHighChurn(caseOf(event.data)!)" icon="tabler:flame" size="12" class="text-caution" />
          <v-icon v-if="isOverdue(caseOf(event.data)!)" icon="tabler:clock-exclamation" size="12" />
          <span v-if="caseOf(event.data)!.assignedDev" class="cal-pill__dev">{{ firstName(caseOf(event.data)!.assignedDev!) }}</span>
        </span>
      </template>
    </FoxCalendar>
  </div>

  <ExtendDueDateDialog
    v-model="extend.open"
    :test-case="extendCase"
    :suggested-date="extend.suggestedDate"
    @extended="notify(`เลื่อน ${$event.id} เป็น ${formatDateTH($event.expiryDate)} แล้ว`)"
  />
  <v-snackbar v-model="snackbar.show" :color="snackbar.color">{{ snackbar.text }}</v-snackbar>
</template>

<style scoped>
.calendar-filters > * {
  width: 200px;
}

.cal-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.cal-pill__dev {
  margin-left: auto;
  padding-left: 4px;
  opacity: 0.72;
  white-space: nowrap;
}

@media (max-width: 599.98px) {
  .calendar-filters,
  .calendar-filters > * {
    width: 100%;
  }
}
</style>
