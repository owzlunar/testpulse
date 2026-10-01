<script setup lang="ts">
import { isHighChurn, isOverdue, overdueDays } from '@/services/test-case.service'
import type { TestCase } from '@/types'

// SLA / bottleneck flags: overdue, ping-pong churn, requirement changed, root cause
defineProps<{ testCase: TestCase }>()
</script>

<template>
  <v-chip v-if="isOverdue(testCase)" color="error" size="x-small" variant="flat" prepend-icon="tabler:clock-exclamation">
    เลยกำหนด {{ overdueDays(testCase) }} วัน
  </v-chip>
  <v-chip
    v-if="isHighChurn(testCase)"
    color="caution"
    size="x-small"
    variant="tonal"
    prepend-icon="tabler:flame"
    :title="`ถูกตีกลับ / แก้ซ้ำ ${testCase.churnCount} รอบ`"
  >
    แก้ซ้ำ {{ testCase.churnCount }} รอบ
  </v-chip>
  <v-chip
    v-if="testCase.reviewNeeded"
    color="warning"
    size="x-small"
    variant="tonal"
    prepend-icon="tabler:alert-circle"
    :title="`${testCase.reviewNeeded.reason} หลังเขียนเคสนี้`"
  >
    ต้องทบทวน ({{ testCase.reviewNeeded.requirementCodes.join(', ') }})
  </v-chip>
  <v-chip v-if="testCase.rootCauseTag" color="secondary" size="x-small" variant="outlined" prepend-icon="tabler:tag">
    {{ testCase.rootCauseTag }}
  </v-chip>
</template>
