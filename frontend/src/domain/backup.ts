import type { BackupJobKind, BackupJobResult, BackupJobTrigger, Option } from '@/types'

// Backup & recovery (PRD 5.15): labels, tones and icons of the agent's jobs, and the simple
// "every day at …" / "every … at …" schedules the page edits, as cron expressions for the agent.

export const BACKUP_JOB_KINDS: Option<BackupJobKind>[] = [
  { value: 'backup', label: 'สำรองข้อมูล', tone: 'primary', icon: 'tabler:database-export', hint: 'dump ฐานข้อมูล ส่งไป off-site แล้วตรวจ' },
  { value: 'verify', label: 'ตรวจ backup', tone: 'info', icon: 'tabler:shield-check', hint: 'ตรวจว่าทุกไฟล์มีที่ off-site และ dump ล่าสุดอ่านได้' },
  { value: 'drill', label: 'ซ้อมกู้', tone: 'secondary', icon: 'tabler:database-import', hint: 'กู้ลงฐานซ้อมแล้วเทียบกับฐานจริง ไม่แตะระบบจริง' },
]
export const backupJobKindOf = (kind: BackupJobKind): Option<BackupJobKind> => BACKUP_JOB_KINDS.find((k) => k.value === kind) ?? BACKUP_JOB_KINDS[0]!

export const BACKUP_JOB_RESULTS: Option<BackupJobResult>[] = [
  { value: 'running', label: 'กำลังทำ', tone: 'info', icon: 'tabler:loader-2' },
  { value: 'ok', label: 'สำเร็จ', tone: 'success', icon: 'tabler:circle-check' },
  { value: 'warning', label: 'สำเร็จ มีคำเตือน', tone: 'warning', icon: 'tabler:alert-triangle' },
  { value: 'failed', label: 'ไม่สำเร็จ', tone: 'error', icon: 'tabler:circle-x' },
]
export const backupJobResultOf = (result: BackupJobResult): Option<BackupJobResult> =>
  BACKUP_JOB_RESULTS.find((r) => r.value === result) ?? BACKUP_JOB_RESULTS[0]!

export const BACKUP_JOB_TRIGGERS: Record<BackupJobTrigger, string> = { schedule: 'ตามเวลา', manual: 'สั่งเอง', 'catch-up': 'ชดเชยรอบที่ขาด' }

/** 11627 -> "11.4 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  // one decimal below 100 (11.4 KB), none above (240 MB), never a trailing .0 (62 GB)
  const shown = value < 100 ? Math.round(value * 10) / 10 : Math.round(value)
  return `${shown} ${units[unit]}`
}

export const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const

/** a schedule the page can show as fields; anything else stays a cron expression */
export type SimpleSchedule = { every: 'day'; time: string } | { every: 'week'; weekday: number; time: string } | { every: 'cron'; cron: string }

const pad = (n: number) => String(n).padStart(2, '0')

/** "0 2 * * *" -> every day 02:00; "30 3 * * 0" -> every Sunday 03:30; else cron */
export function scheduleOf(cron: string): SimpleSchedule {
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6])$/.exec(cron.trim().replace(/\s+/g, ' '))
  if (!m) return { every: 'cron', cron }
  const [minute, hour, weekday] = [Number(m[1]), Number(m[2]), m[3]!]
  if (minute > 59 || hour > 23) return { every: 'cron', cron }
  const time = `${pad(hour)}:${pad(minute)}`
  return weekday === '*' ? { every: 'day', time } : { every: 'week', weekday: Number(weekday), time }
}

export function cronOf(schedule: SimpleSchedule): string {
  if (schedule.every === 'cron') return schedule.cron.trim().replace(/\s+/g, ' ')
  const [hour, minute] = schedule.time.split(':').map(Number)
  return `${minute ?? 0} ${hour ?? 0} * * ${schedule.every === 'week' ? schedule.weekday : '*'}`
}

/** "ทุกวัน 02:00", "ทุกวันอาทิตย์ 03:00", or the cron expression */
export function describeSchedule(cron: string): string {
  const s = scheduleOf(cron)
  if (s.every === 'day') return `ทุกวัน ${s.time} น.`
  if (s.every === 'week') return `ทุกวัน${WEEKDAYS[s.weekday]} ${s.time} น.`
  return `cron: ${s.cron}`
}
