<script setup lang="ts" generic="T">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDisplay } from 'vuetify'
import FullCalendar from '@fullcalendar/vue3'
import type { CalendarOptions, EventContentArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import thLocale from '@fullcalendar/core/locales/th'
import type { CalendarEvent, CalendarEventChange } from '@/types'

const props = withDefaults(
  defineProps<{
    events?: CalendarEvent<T>[]
    /** id of the event highlighted (detail shown in the right sidebar) */
    selectedId?: string | null
  }>(),
  { events: () => [], selectedId: null },
)
const emit = defineEmits<{
  'date-click': [date: string]
  'event-click': [id: string]
  'event-change': [change: CalendarEventChange]
}>()
defineSlots<{
  /** custom event body; falls back to the event title */
  event?: (props: { event: CalendarEvent<T>; view: string }) => any
}>()

const { smAndDown, xs } = useDisplay()

// FullCalendar only listens to window resizes; the content area also changes
// width when the side drawers open, rail-collapse or close.
const root = ref<HTMLElement>()
const calendar = ref<InstanceType<typeof FullCalendar>>()
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(() => calendar.value?.getApi().updateSize())
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const byId = computed(() => new Map(props.events.map((e) => [e.id, e])))
const eventOf = (arg: EventContentArg) => byId.value.get(arg.event.id)

// keep 'YYYY-MM-DD' for all-day, 'YYYY-MM-DDTHH:mm' for timed events
const trim = (s: string, allDay: boolean) => s.slice(0, allDay ? 10 : 16)

const options = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, listPlugin, interactionPlugin],
  locale: thLocale,
  // read once on mount: phones start in the list view, month cells are too small
  initialView: xs.value ? 'listMonth' : 'dayGridMonth',
  headerToolbar: smAndDown.value
    ? { left: 'prev,next', center: 'title', right: 'dayGridMonth,listMonth' }
    : { left: 'prev next today', center: 'title', right: 'dayGridMonth,dayGridWeek,listMonth' },
  buttonText: { today: 'วันนี้', month: 'เดือน', week: 'สัปดาห์', list: 'รายการ' },
  dayHeaderFormat: { weekday: 'short' },
  height: 'auto',
  dayMaxEvents: smAndDown.value ? 2 : 3,
  editable: true,
  dateClick: (info) => emit('date-click', info.dateStr),
  eventClick: (info) => {
    info.jsEvent.preventDefault()
    emit('event-click', info.event.id)
  },
  eventChange: ({ event, revert }) =>
    emit('event-change', {
      id: event.id,
      start: trim(event.startStr, event.allDay),
      end: event.end ? trim(event.endStr, event.allDay) : null,
      allDay: event.allDay,
      revert,
    }),
  events: props.events.map(({ tone = 'primary', data: _data, ...e }) => ({
    ...e,
    end: e.end ?? undefined,
    classNames: [`ev-${tone}`, e.id === props.selectedId ? 'is-selected' : ''],
  })),
}))
</script>

<template>
  <v-card class="fox-card-body">
    <div ref="root" class="fox-calendar">
      <FullCalendar ref="calendar" :options="options">
        <template #eventContent="arg">
          <slot v-if="eventOf(arg)" name="event" :event="eventOf(arg)!" :view="arg.view.type">
            <span class="fc-event-title">{{ arg.event.title }}</span>
          </slot>
        </template>
      </FullCalendar>
    </div>
  </v-card>
</template>
