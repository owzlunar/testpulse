import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupJob, BackupJobKind, BackupJobResult, BackupJobTrigger } from '#contract/types.js'
import { readJson, writeJson } from './files.js'

// jobs.json (every job of the last KEEP_DAYS, newest first) and logs/<job id>.log (each job's output).

export const KEEP_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export class JobStore {
  private readonly path: string
  readonly logDir: string
  private jobs: BackupJob[]

  constructor(dataDir: string) {
    this.path = join(dataDir, 'jobs.json')
    this.logDir = join(dataDir, 'logs')
    mkdirSync(this.logDir, { recursive: true, mode: 0o700 })
    // a job still "running" here was cut short: the agent stopped while it ran
    this.jobs = readJson<BackupJob[]>(this.path, []).map((job) =>
      job.result === 'running'
        ? { ...job, result: 'failed', finishedAt: new Date().toISOString(), summary: 'หยุดกลางคัน: agent ถูกปิดหรือเริ่มใหม่ระหว่างทำงาน' }
        : job,
    )
    this.prune()
  }

  list(): BackupJob[] {
    return this.jobs
  }

  get(id: string): BackupJob | undefined {
    return this.jobs.find((j) => j.id === id)
  }

  running(): BackupJob | undefined {
    return this.jobs.find((j) => j.result === 'running')
  }

  /** the newest finished job of a kind (any result, or only the given ones) */
  last(kind: BackupJobKind, results?: BackupJobResult[]): BackupJob | undefined {
    return this.jobs.find((j) => j.kind === kind && j.result !== 'running' && (!results || results.includes(j.result)))
  }

  logPath(id: string): string {
    return join(this.logDir, `${id}.log`)
  }

  readLog(id: string): string {
    const path = this.logPath(id)
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  }

  create(kind: BackupJobKind, trigger: BackupJobTrigger, startedBy?: string): BackupJob {
    const now = new Date()
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '')
    const job: BackupJob = {
      id: `job-${stamp}-${randomBytes(3).toString('hex')}`,
      kind,
      trigger,
      ...(startedBy ? { startedBy } : {}),
      startedAt: now.toISOString(),
      result: 'running',
      summary: '',
    }
    this.jobs = [job, ...this.jobs]
    this.save()
    return job
  }

  finish(id: string, result: Exclude<BackupJobResult, 'running'>, summary: string, snapshot?: string): BackupJob {
    let done: BackupJob | undefined
    this.jobs = this.jobs.map((j) => {
      if (j.id !== id) return j
      done = { ...j, result, summary, finishedAt: new Date().toISOString(), ...(snapshot ? { snapshot } : {}) }
      return done
    })
    if (!done) throw new Error(`no job ${id}`)
    this.save()
    return done
  }

  /** drops jobs (and their logs) older than KEEP_DAYS */
  prune(now = Date.now()): void {
    const keep = this.jobs.filter((j) => now - Date.parse(j.startedAt) < KEEP_DAYS * DAY_MS)
    const kept = new Set(keep.map((j) => `${j.id}.log`))
    for (const file of readdirSync(this.logDir)) if (!kept.has(file)) rmSync(join(this.logDir, file), { force: true })
    this.jobs = keep
    this.save()
  }

  private save(): void {
    writeJson(this.path, this.jobs)
  }
}
