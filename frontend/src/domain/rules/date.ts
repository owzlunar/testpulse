// Calendar dates as 'YYYY-MM-DD' in local time (the server runs in the app's time zone, CRON_TIMEZONE).

const pad = (n: number) => String(n).padStart(2, '0')
const DAY = 86_400_000

/** Date -> 'YYYY-MM-DD' in local time */
export const toISODate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Today as 'YYYY-MM-DD' */
export const todayISO = (): string => toISODate(new Date())

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'); negative when `to` is earlier */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from.slice(0, 10)}T00:00`).getTime()
  const b = new Date(`${to.slice(0, 10)}T00:00`).getTime()
  return Math.round((b - a) / DAY)
}

/** Days until `iso` from today (0 = today, negative = past) */
export const daysFromToday = (iso: string): number => daysBetween(todayISO(), iso)
