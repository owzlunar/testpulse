import { describe, expect, it } from 'vitest'
import { cronOf, describeSchedule, formatBytes, scheduleOf } from './backup'

describe('backup schedules', () => {
  it('reads the simple schedules the page edits, and keeps anything else as cron', () => {
    expect(scheduleOf('0 2 * * *')).toEqual({ every: 'day', time: '02:00' })
    expect(scheduleOf('30 3 * * 0')).toEqual({ every: 'week', weekday: 0, time: '03:30' })
    expect(scheduleOf('0 */6 * * *')).toEqual({ every: 'cron', cron: '0 */6 * * *' })
    expect(scheduleOf('0 2 1 * *')).toEqual({ every: 'cron', cron: '0 2 1 * *' })
  })

  it('writes them back as the cron expressions the agent runs', () => {
    expect(cronOf({ every: 'day', time: '02:00' })).toBe('0 2 * * *')
    expect(cronOf({ every: 'week', weekday: 6, time: '23:45' })).toBe('45 23 * * 6')
    expect(cronOf({ every: 'cron', cron: ' 0  */6 * * * ' })).toBe('0 */6 * * *')
    for (const cron of ['0 2 * * *', '15 4 * * 3']) expect(cronOf(scheduleOf(cron))).toBe(cron)
  })

  it('describes them in Thai', () => {
    expect(describeSchedule('0 2 * * *')).toBe('ทุกวัน 02:00 น.')
    expect(describeSchedule('0 3 * * 0')).toBe('ทุกวันอาทิตย์ 03:00 น.')
    expect(describeSchedule('0 */6 * * *')).toBe('cron: 0 */6 * * *')
  })
})

describe('formatBytes', () => {
  it('rounds to a readable unit', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(11627)).toBe('11.4 KB')
    expect(formatBytes(62 * 1024 ** 3)).toBe('62 GB')
  })
})
