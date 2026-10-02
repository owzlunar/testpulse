import cron, { type ScheduledTask } from 'node-cron'
import { config } from '../config/env.js'
import { logger } from '../config/logger.js'
import { withLock } from './with-lock.js'

// Scheduled jobs of the modules. Each run takes the job's distributed lock, so with several
// instances a job runs once per tick.

export interface ScheduledJob {
  name: string
  /** cron expression, in CRON_TIMEZONE */
  schedule: string
  /** lease length; longer than the job's longest run */
  lockMs?: number
  run(): Promise<void>
}

const tasks: ScheduledTask[] = []

export async function runJob(job: ScheduledJob): Promise<void> {
  const started = Date.now()
  try {
    await withLock(`job:${job.name}`, job.lockMs ?? 5 * 60 * 1000, job.run)
    logger.debug(`[job] ${job.name} finished in ${Date.now() - started}ms`)
  } catch (err) {
    logger.error(`[job] ${job.name} failed: ${(err as Error).message}`, { stack: (err as Error).stack })
  }
}

export function startJobs(jobs: ScheduledJob[]): void {
  for (const job of jobs) {
    if (!cron.validate(job.schedule)) throw new Error(`Job "${job.name}": invalid schedule "${job.schedule}"`)
    tasks.push(cron.schedule(job.schedule, () => runJob(job), { timezone: config.cron.timezone, noOverlap: true, name: job.name }))
    logger.info(`[job] ${job.name} scheduled (${job.schedule})`)
  }
}

export async function stopJobs(): Promise<void> {
  await Promise.all(tasks.splice(0).map((t) => t.stop()))
}
