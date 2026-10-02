import { describe, expect, it, vi } from 'vitest'
import { useTestDatabase } from '../../../../tests/helpers/database.js'
import { runJob, startJobs, stopJobs } from '../scheduler.js'
import { withLock } from '../with-lock.js'

useTestDatabase()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('withLock', () => {
  it('runs a job on one caller at a time', async () => {
    let running = 0
    let maxRunning = 0
    const job = async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await sleep(50)
      running--
      return 'done'
    }
    const results = await Promise.all([withLock('report', 10_000, job), withLock('report', 10_000, job)])
    expect(maxRunning).toBe(1)
    expect(results.filter((r) => r === 'done')).toHaveLength(1)
    expect(results.filter((r) => r === null)).toHaveLength(1)
  })

  it('releases the lock afterwards, also when the job fails', async () => {
    await expect(
      withLock('flaky', 10_000, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await withLock('flaky', 10_000, async () => 'again')).toBe('again')
  })

  it('takes over a lease that expired (crashed instance)', async () => {
    await withLock('stuck', 1, async () => sleep(20))
    expect(await withLock('stuck', 10_000, async () => 'taken')).toBe('taken')
  })
})

describe('scheduler', () => {
  it('logs a failing job instead of crashing', async () => {
    await expect(runJob({ name: 'broken', schedule: '* * * * *', run: () => Promise.reject(new Error('x')) })).resolves.toBeUndefined()
  })

  it('refuses an invalid schedule, starts and stops valid ones', async () => {
    expect(() => startJobs([{ name: 'bad', schedule: 'not cron', run: vi.fn() }])).toThrow(/invalid schedule/)
    startJobs([{ name: 'ok', schedule: '0 3 * * *', run: vi.fn() }])
    await stopJobs()
  })
})
