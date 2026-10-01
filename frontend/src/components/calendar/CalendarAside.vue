<script setup lang="ts">
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { storeToRefs } from 'pinia'
import FoxEmptyState from '@/components/ui/FoxEmptyState.vue'
import TestCaseBadges from '@/components/test-cases/TestCaseBadges.vue'
import TestCasePriorityChip from '@/components/test-cases/TestCasePriorityChip.vue'
import TestCaseStatusChip from '@/components/test-cases/TestCaseStatusChip.vue'
import TestCaseVersionTimeline from '@/components/test-cases/TestCaseVersionTimeline.vue'
import { useAsyncAction } from '@/composables/useAsyncAction'
import { useTestCasePermissions } from '@/composables/useTestCasePermissions'
import { milestoneTypeOf } from '@/services/project.service'
import { ROOT_CAUSES, dwellOf, isOverdue, overdueDays } from '@/services/test-case.service'
import { useCalendarStore } from '@/stores/calendar.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useRequirementStore } from '@/stores/requirement.store'
import { useTestCaseStore } from '@/stores/test-case.store'
import type { TestCase } from '@/types'
import { formatDateTH } from '@/utils/date'

const calendar = useCalendarStore()
const { selectedCase: tc, selectedMilestone: milestone, selectedDate, casesOnSelectedDate, casesBeforeMilestone, churnCases, overdueCases } =
  storeToRefs(calendar)
const store = useTestCaseStore()
const layout = useLayoutStore()
const requirementStore = useRequirementStore()
const { lgAndUp } = useDisplay()
const { canHandOff } = useTestCasePermissions()

const dateLabel = computed(() => formatDateTH(selectedDate.value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
const dwell = computed(() => (tc.value ? dwellOf(tc.value.status) : null))

const { busy, run } = useAsyncAction()
const setRootCause = (c: TestCase, tag: string) =>
  tag && tag !== c.rootCauseTag && run(() => store.update(c.id, { rootCauseTag: tag, changeSummary: `ระบุ Root Cause: ${tag}` }, c.projectId))
const handOff = (c: TestCase) => run(() => store.update(c.id, { status: 'ready_for_test' }, c.projectId))
</script>

<template>
  <div class="calendar-aside">
    <div class="calendar-aside__head">
      <h2 class="text-h5">รายละเอียด</h2>
      <v-btn v-if="!lgAndUp" icon="tabler:x" variant="text" size="small" aria-label="ปิด" @click="layout.asideOpen = false" />
    </div>

    <!-- 1. selected test case: bottleneck investigation -->
    <template v-if="tc">
      <section class="calendar-aside__section">
        <div class="d-flex align-center justify-space-between mb-2">
          <div class="d-flex flex-wrap align-center ga-2">
            <v-chip color="primary" size="small" variant="flat" class="fox-num">{{ tc.id }}</v-chip>
            <TestCaseStatusChip :status="tc.status" />
          </div>
          <v-btn icon="tabler:x" variant="text" size="x-small" aria-label="ยกเลิกการเลือก" @click="calendar.selectDate(tc.expiryDate)" />
        </div>
        <h3 class="text-h6 mb-2">{{ tc.name }}</h3>
        <div class="d-flex flex-wrap ga-2">
          <TestCasePriorityChip :priority="tc.priority" />
          <TestCaseBadges :test-case="tc" />
        </div>

        <v-alert v-if="isOverdue(tc)" type="error" variant="tonal" density="compact" icon="tabler:clock-exclamation" class="mt-4">
          เลยกำหนดส่งมอบ {{ overdueDays(tc) }} วัน (ครบกำหนด {{ formatDateTH(tc.expiryDate) }})
        </v-alert>
        <v-alert v-if="(tc.churnCount ?? 0) > 1" color="caution" variant="tonal" density="compact" icon="tabler:flame" class="mt-3">
          ตีกลับไปมาแล้ว {{ tc.churnCount }} รอบ — ควรวิเคราะห์หาสาเหตุที่แท้จริง
        </v-alert>

        <dl class="calendar-aside__meta mt-4">
          <div>
            <dt><v-icon :icon="dwell!.icon" size="18" /></dt>
            <dd class="text-body-1">
              <span class="text-muted">อยู่ที่ </span><span :class="`text-${dwell!.tone}`">{{ dwell!.label }}</span>
            </dd>
          </div>
          <div>
            <dt><v-icon icon="tabler:calendar-due" size="18" /></dt>
            <dd class="text-body-1" :class="{ 'text-error': isOverdue(tc) }">{{ formatDateTH(tc.expiryDate) }}</dd>
          </div>
          <div>
            <dt><v-icon icon="tabler:code" size="18" /></dt>
            <dd class="text-body-1">{{ tc.assignedDev || 'ยังไม่ระบุ Developer' }}</dd>
          </div>
          <div>
            <dt><v-icon icon="tabler:shield-check" size="18" /></dt>
            <dd class="text-body-1">{{ tc.assignedTo || 'ยังไม่ระบุ QA' }}</dd>
          </div>
          <div>
            <dt><v-icon icon="tabler:git-branch" size="18" /></dt>
            <dd class="text-body-1 fox-num">{{ tc.version }}</dd>
          </div>
        </dl>

        <div class="d-flex ga-2 mt-4">
          <v-btn variant="tonal" color="primary" prepend-icon="tabler:calendar-time" class="flex-grow-1" @click="calendar.openExtend(tc.id)">ขยายเวลา</v-btn>
          <v-btn v-if="tc.status === 'pending' && canHandOff" color="info" prepend-icon="tabler:send" class="flex-grow-1" :loading="busy" @click="handOff(tc)">
            ส่งมอบพร้อมเทส
          </v-btn>
        </div>
      </section>

      <v-divider />

      <section class="calendar-aside__section">
        <div class="text-overline text-muted mb-2">Root Cause</div>
        <v-chip-group :model-value="tc.rootCauseTag" column @update:model-value="setRootCause(tc, $event)">
          <v-chip v-for="tag in ROOT_CAUSES" :key="tag" :value="tag" size="small" variant="tonal" color="primary" filter>{{ tag }}</v-chip>
        </v-chip-group>
      </section>

      <v-divider />

      <section class="calendar-aside__section">
        <div class="text-overline text-muted mb-2">Spec</div>
        <div class="text-subtitle-2">Requirement</div>
        <p class="text-body-2 text-muted mb-3 aside-pre">{{ requirementStore.textFor(tc) }}</p>
        <div class="text-subtitle-2">Test Scenario</div>
        <p class="text-body-2 text-muted mb-0">{{ tc.testScenario }}</p>
      </section>

      <v-divider />

      <section class="calendar-aside__section">
        <div class="text-overline text-muted mb-3">ไทม์ไลน์การส่งมอบ & ตีกลับ</div>
        <TestCaseVersionTimeline :history="tc.versionHistory ?? []" />
      </section>
    </template>

    <!-- 2. selected milestone -->
    <template v-else-if="milestone">
      <section class="calendar-aside__section">
        <v-card :color="milestoneTypeOf(milestone.type).tone" variant="tonal" class="pa-4">
          <div class="d-flex align-center justify-space-between mb-2">
            <v-chip :color="milestoneTypeOf(milestone.type).tone" size="small" variant="flat" :prepend-icon="milestoneTypeOf(milestone.type).icon">
              {{ milestoneTypeOf(milestone.type).label }}
            </v-chip>
            <v-btn icon="tabler:x" variant="text" size="x-small" aria-label="ยกเลิกการเลือก" @click="calendar.selectDate(milestone.date)" />
          </div>
          <h3 class="text-h6 text-high-emphasis">{{ milestone.title }}</h3>
          <div class="text-body-2 text-high-emphasis">{{ formatDateTH(milestone.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</div>
        </v-card>
        <p v-if="milestone.description" class="text-body-2 text-muted mt-3 mb-0">{{ milestone.description }}</p>
      </section>
      <v-divider />
      <section class="calendar-aside__section">
        <div class="text-overline text-muted mb-2">ครบกำหนดก่อน Milestone นี้ ({{ casesBeforeMilestone.length }})</div>
        <v-list v-if="casesBeforeMilestone.length" class="pa-0">
          <v-list-item v-for="c in casesBeforeMilestone" :key="c.id" class="px-2" @click="calendar.selectCase(c.id)">
            <v-list-item-title class="text-subtitle-2"><span class="fox-num text-primary">{{ c.id }}</span> {{ c.name }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">{{ formatDateTH(c.expiryDate) }}</v-list-item-subtitle>
            <template #append><TestCaseStatusChip :status="c.status" size="x-small" class="ml-2" /></template>
          </v-list-item>
        </v-list>
        <FoxEmptyState v-else icon="tabler:calendar-off" title="ไม่มีเคสก่อน Milestone นี้" />
      </section>
    </template>

    <!-- 3. selected date + watchlists -->
    <template v-else>
      <section class="calendar-aside__section">
        <div class="text-overline text-muted mb-1">วันที่เลือก</div>
        <div class="text-subtitle-2 mb-3">{{ dateLabel }}</div>
        <v-list v-if="casesOnSelectedDate.length" class="pa-0">
          <v-list-item v-for="c in casesOnSelectedDate" :key="c.id" class="px-2" @click="calendar.selectCase(c.id)">
            <v-list-item-title class="text-subtitle-2"><span class="fox-num text-primary">{{ c.id }}</span> {{ c.name }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption">Dev: {{ c.assignedDev || '-' }}</v-list-item-subtitle>
            <template #append><TestCaseStatusChip :status="c.status" size="x-small" class="ml-2" /></template>
          </v-list-item>
        </v-list>
        <FoxEmptyState v-else icon="tabler:calendar-off" title="ไม่มีเคสครบกำหนดวันนี้" text="เลือกวันอื่นในปฏิทิน" />
      </section>

      <v-divider />

      <section class="calendar-aside__section">
        <div class="text-overline text-caution mb-2">เคสแก้ซ้ำที่ต้องจับตา</div>
        <div v-if="churnCases.length" class="d-flex flex-column ga-2">
          <button v-for="c in churnCases.slice(0, 5)" :key="c.id" type="button" class="calendar-aside__row" @click="calendar.selectCase(c.id)">
            <v-avatar color="caution" rounded="lg" size="40"><span class="text-subtitle-2 fox-num">{{ c.churnCount }}×</span></v-avatar>
            <span class="overflow-hidden text-start">
              <span class="d-block text-subtitle-2 text-truncate">{{ c.id }} {{ c.name }}</span>
              <span class="d-block text-caption text-muted text-truncate">{{ c.rootCauseTag || 'ยังไม่ระบุ Root Cause' }}</span>
            </span>
          </button>
        </div>
        <div v-else class="text-body-2 text-muted">ไม่มีเคสที่แก้ซ้ำผิดปกติ</div>
      </section>

      <v-divider />

      <section class="calendar-aside__section">
        <div class="text-overline text-error mb-2">เลยกำหนดส่งมอบ</div>
        <div v-if="overdueCases.length" class="d-flex flex-column ga-2">
          <button v-for="c in overdueCases.slice(0, 5)" :key="c.id" type="button" class="calendar-aside__row" @click="calendar.selectCase(c.id)">
            <v-avatar color="error" rounded="lg" size="40"><span class="text-subtitle-2 fox-num">{{ overdueDays(c) }}d</span></v-avatar>
            <span class="overflow-hidden text-start">
              <span class="d-block text-subtitle-2 text-truncate">{{ c.id }} {{ c.name }}</span>
              <span class="d-block text-caption text-muted text-truncate">Dev: {{ c.assignedDev || '-' }}</span>
            </span>
          </button>
        </div>
        <div v-else class="text-body-2 text-muted">ไม่มีเคสที่เลยกำหนด</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.aside-pre {
  white-space: pre-line;
}

.calendar-aside__head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding-inline: 20px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.calendar-aside__section {
  padding: 20px;
}

.calendar-aside__meta {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
}

.calendar-aside__meta > div {
  display: grid;
  grid-template-columns: 18px 1fr;
  column-gap: 12px;
}

.calendar-aside__meta dt {
  padding-top: 2px;
  color: rgb(var(--v-theme-muted));
}

.calendar-aside__meta dd {
  margin: 0;
}

.calendar-aside__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px;
  border-radius: var(--fox-radius-control);
  color: inherit;
  transition: background-color 0.15s;
}

.calendar-aside__row:hover,
.calendar-aside__row:focus-visible {
  background: rgba(var(--v-theme-primary), 0.06);
  outline: none;
}
</style>
