import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import type { CalendarEvent, ProjectMilestone, TestCase } from '@/types'
import { milestoneTypeOf } from '@/services/project.service'
import { isHighChurn, isOverdue, statusOf } from '@/services/test-case.service'
import { todayISO } from '@/utils/date'
import { useProjectStore } from './project.store'

export type QuickFilter = 'ALL' | 'PING_PONG' | 'OVERDUE' | 'FAILED' | 'PENDING' | 'READY' | 'PASSED'

type Selection = { kind: 'case'; id: string } | { kind: 'milestone'; id: string } | { kind: 'date'; date: string }

export type CalendarItem = { kind: 'case'; testCase: TestCase } | { kind: 'milestone'; milestone: ProjectMilestone }

const QUICK_FILTERS: Record<QuickFilter, (tc: TestCase) => boolean> = {
  ALL: () => true,
  PING_PONG: isHighChurn,
  OVERDUE: isOverdue,
  FAILED: (tc) => tc.status === 'failed',
  PENDING: (tc) => tc.status === 'pending',
  READY: (tc) => tc.status === 'ready_for_test',
  PASSED: (tc) => tc.status === 'passed',
}

// The calendar page and its right sidebar are separate router views; both read this store.
export const useCalendarStore = defineStore('calendar', () => {
  const { currentCases: cases, currentProject } = storeToRefs(useProjectStore())

  const quickFilter = ref<QuickFilter>('ALL')
  const devFilter = ref<string | null>(null)
  const rootCauseFilter = ref<string | null>(null)
  const selection = ref<Selection>({ kind: 'date', date: todayISO() })
  /** extend-due-date dialog, opened from the aside or by dragging a case */
  const extend = ref<{ open: boolean; caseId: string | null; suggestedDate: string | null }>({
    open: false, caseId: null, suggestedDate: null,
  })

  const milestones = computed(() => [...(currentProject.value?.milestones ?? [])].sort((a, b) => a.date.localeCompare(b.date)))
  const nextMilestone = computed(() => milestones.value.find((m) => m.date >= todayISO()) ?? null)

  const churnCases = computed(() => cases.value.filter(isHighChurn).sort((a, b) => (b.churnCount ?? 0) - (a.churnCount ?? 0)))
  const overdueCases = computed(() => cases.value.filter(isOverdue).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)))

  const devOptions = computed(() => [...new Set(cases.value.map((c) => c.assignedDev).filter(Boolean))] as string[])
  const rootCauseOptions = computed(() => [...new Set(cases.value.map((c) => c.rootCauseTag).filter(Boolean))] as string[])

  const filteredCases = computed(() =>
    cases.value.filter(
      (tc) =>
        QUICK_FILTERS[quickFilter.value](tc) &&
        (!devFilter.value || tc.assignedDev === devFilter.value) &&
        (!rootCauseFilter.value || tc.rootCauseTag === rootCauseFilter.value),
    ),
  )

  const countOf = (filter: QuickFilter) => cases.value.filter(QUICK_FILTERS[filter]).length

  /** events for FoxCalendar: milestones (fixed) + test cases on their due date (draggable) */
  const events = computed<CalendarEvent<CalendarItem>[]>(() => [
    ...milestones.value.map((m) => ({
      id: `ms-${m.id}`,
      title: m.title,
      start: m.date,
      allDay: true,
      editable: false,
      tone: milestoneTypeOf(m.type).tone,
      data: { kind: 'milestone' as const, milestone: m },
    })),
    ...filteredCases.value
      .filter((tc) => tc.expiryDate)
      .map((tc) => ({
        id: tc.id,
        title: `${tc.id} ${tc.name}`,
        start: tc.expiryDate,
        allDay: true,
        editable: true,
        tone: isOverdue(tc) ? ('error' as const) : statusOf(tc.status).tone,
        data: { kind: 'case' as const, testCase: tc },
      })),
  ])

  const selectedCase = computed(() =>
    selection.value.kind === 'case' ? cases.value.find((c) => c.id === (selection.value as { id: string }).id) ?? null : null,
  )
  const selectedMilestone = computed(() =>
    selection.value.kind === 'milestone' ? milestones.value.find((m) => m.id === (selection.value as { id: string }).id) ?? null : null,
  )
  const selectedDate = computed(() =>
    selection.value.kind === 'date' ? selection.value.date : selectedCase.value?.expiryDate ?? selectedMilestone.value?.date ?? todayISO(),
  )
  const selectedEventId = computed(() =>
    selection.value.kind === 'case' ? selection.value.id : selection.value.kind === 'milestone' ? `ms-${selection.value.id}` : null,
  )

  const casesOnSelectedDate = computed(() => cases.value.filter((c) => c.expiryDate === selectedDate.value))
  const casesBeforeMilestone = computed(() =>
    selectedMilestone.value ? cases.value.filter((c) => c.expiryDate && c.expiryDate <= selectedMilestone.value!.date) : [],
  )

  const selectCase = (id: string) => (selection.value = { kind: 'case', id })
  const selectMilestone = (id: string) => (selection.value = { kind: 'milestone', id })
  const selectDate = (date: string) => (selection.value = { kind: 'date', date })

  /** event id from FoxCalendar -> case or milestone */
  function selectEvent(eventId: string) {
    if (eventId.startsWith('ms-')) selectMilestone(eventId.slice(3))
    else selectCase(eventId)
  }

  function openExtend(caseId: string, suggestedDate: string | null = null) {
    extend.value = { open: true, caseId, suggestedDate }
  }

  return {
    quickFilter, devFilter, rootCauseFilter, selection, extend,
    milestones, nextMilestone, churnCases, overdueCases, devOptions, rootCauseOptions, filteredCases, events,
    selectedCase, selectedMilestone, selectedDate, selectedEventId, casesOnSelectedDate, casesBeforeMilestone,
    countOf, selectCase, selectMilestone, selectDate, selectEvent, openExtend,
  }
})
