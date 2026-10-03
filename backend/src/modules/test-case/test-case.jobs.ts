import { daysFromToday } from '#contract/rules/date.js'
import type { ScheduledJob } from '#core/jobs/scheduler.js'
import { notify } from '#core/notify/notify-sink.js'
import { testCaseRepository } from './test-case.repository.js'
import { audienceOf } from './test-case.service.js'

/** the furthest ahead anyone can ask to be warned (settings allow up to 30 days) */
const FURTHEST_WARNING_DAYS = 30

/**
 * Every morning: unfinished cases due soon or overdue tell the people on them (their QA and developer,
 * else both sides). Who sees a "due soon" one depends on how early they want to know
 * (expiryDaysThreshold); each case is announced at most once a day.
 */
export async function announceDueDates(): Promise<number> {
  let sent = 0
  for (const tc of await testCaseRepository.withDueDate()) {
    const left = daysFromToday(tc.expiryDate)
    if (left > FURTHEST_WARNING_DAYS) continue
    const base = {
      type: 'EXPIRING' as const,
      projectId: tc.projectId,
      testCaseId: tc.id,
      to: await audienceOf(tc),
      dueInDays: left,
      dailyKey: `due:${tc.uid}`,
    }
    if (left >= 0) {
      await notify({
        ...base,
        title: 'Test Case ใกล้ครบกำหนด',
        message: `${tc.id}: "${tc.name}" ครบกำหนด${left === 0 ? 'วันนี้' : `ในอีก ${left} วัน`} (${tc.expiryDate})`,
        severity: left <= 1 ? 'error' : 'warning',
      })
    } else {
      // escalate to whoever is holding the case
      const target =
        tc.status === 'ready_for_test'
          ? 'แจ้งเตือนทีม QA ให้เร่งทดสอบ'
          : tc.status === 'pending' || tc.status === 'failed'
            ? `แจ้งเตือน ${tc.assignedDev || 'ทีม Dev'}`
            : ''
      await notify({
        ...base,
        title: `เลยกำหนด SLA ${-left} วัน`,
        message: `${tc.id}: "${tc.name}" เลยกำหนดส่งมอบ (${tc.expiryDate}) ${target}`.trim(),
        severity: 'error',
      })
    }
    sent++
  }
  return sent
}

export const dueDateJob: ScheduledJob = {
  name: 'test-case-due-dates',
  // 08:00 every day, in CRON_TIMEZONE
  schedule: '0 8 * * *',
  async run() {
    await announceDueDates()
  },
}
