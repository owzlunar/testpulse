import { toISODate } from '@/domain/rules/date'

// the calendar-date rules the backend shares live in domain/rules/date.ts
export { daysBetween, daysFromToday, toISODate, todayISO } from '@/domain/rules/date'

/** 'YYYY-MM-DD' + n days */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00`)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** 'YYYY-MM-DD' -> "1 ม.ค. 2569" */
export const formatDateTH = (iso: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00`).toLocaleDateString('th-TH', options) : '-'

/** ISO timestamp -> "30 ก.ย. 14:20" */
export const formatDateTime = (
  iso: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
): string => (iso ? new Date(iso).toLocaleString('th-TH', options) : '-')

/** ISO timestamp -> "14:20" */
export const formatTime = (iso: string): string => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

/** ISO timestamp -> "5 นาทีที่แล้ว", "เมื่อวาน", "3 วันที่แล้ว" */
export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`
  const day = Math.round(hr / 24)
  if (day === 1) return 'เมื่อวาน'
  if (day < 7) return `${day} วันที่แล้ว`
  return formatDateTime(iso, { day: 'numeric', month: 'short' })
}
