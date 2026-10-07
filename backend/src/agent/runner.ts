import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { BackupJob, BackupJobKind, BackupJobResult, BackupJobTrigger } from '#contract/types.js'
import type { AgentConfig } from './config.js'
import type { JobStore } from './jobs.js'

// Runs a job with the scripts in scripts/ (the same backup.sh / restore.sh / verify.sh the command line
// uses), one job at a time, its output into logs/<job id>.log:
//   backup  backup.sh, then verify.sh (storage)
//   verify  verify.sh
//   drill   restore.sh into the scratch database, verify.sh restore, the scratch database dropped

export class BusyError extends Error {
  constructor(readonly job: BackupJob) {
    super('another job is running')
  }
}

export interface StepResult {
  code: number
  output: string
}

/** what a script run needs; tests replace it */
export type ScriptRunner = (script: string, args: string[], log: WriteStream) => Promise<StepResult>

/** drops a database (the drill's scratch one); tests replace it */
export type DropDatabase = (uri: string, db: string) => Promise<void>

export function bashScriptRunner(config: AgentConfig): ScriptRunner {
  return (script, args, log) =>
    new Promise((resolve) => {
      log.write(`\n$ ${script} ${args.join(' ')}\n`)
      const child = spawn('bash', [join(config.scriptsDir, script), ...args], {
        cwd: config.dataDir,
        env: { ...process.env, BACKUP_ENV: config.envFile },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      const collect = (chunk: Buffer) => {
        output += chunk.toString('utf8')
        log.write(chunk)
      }
      child.stdout.on('data', collect)
      child.stderr.on('data', collect)
      child.on('error', (err) => {
        log.write(`${err.message}\n`)
        resolve({ code: 127, output: `${output}\nERROR: ${err.message}` })
      })
      child.on('close', (code) => resolve({ code: code ?? 1, output }))
    })
}

const lines = (output: string) => output.split('\n').map((l) => l.trim())

/** the script's own reason: its ERROR line, else its first FAIL line */
export function failureReason(output: string): string {
  const all = lines(output)
  const error = all.find((l) => l.includes('ERROR: '))
  if (error) return error.slice(error.indexOf('ERROR: ') + 7)
  const fail = all.find((l) => l.startsWith('FAIL'))
  if (fail) return fail.replace(/^FAIL\s+/, '').replace(/\s+/g, ' ')
  return 'ไม่สำเร็จ (ดู log)'
}

/** "passed (2 warning(s))" → 2 */
export const warningsOf = (output: string): number => {
  const m = /passed \((\d+) warning/.exec(output)
  return m ? Number(m[1]) : 0
}

export const snapshotSaved = (output: string) => /saved src\/\S+\/db\/(\S+\.archive\.gz)/.exec(output)?.[1]
export const snapshotFetched = (output: string) => /fetching \S+\/db\/(\S+\.archive\.gz)/.exec(output)?.[1]

interface Outcome {
  result: Exclude<BackupJobResult, 'running'>
  summary: string
  snapshot?: string
}

export class Runner {
  private current: Promise<void> | null = null

  constructor(
    private readonly config: AgentConfig,
    private readonly jobs: JobStore,
    private readonly run: ScriptRunner,
    private readonly dropDatabase: DropDatabase,
    private readonly onFinished: (job: BackupJob) => void | Promise<void>,
  ) {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 })
  }

  get busy(): boolean {
    return this.current !== null
  }

  /** starts a job and returns it at once (running); throws BusyError while another one runs */
  start(kind: BackupJobKind, trigger: BackupJobTrigger, options: { startedBy?: string; snapshot?: string } = {}): BackupJob {
    const running = this.jobs.running()
    if (this.current || running) throw new BusyError(running!)
    const job = this.jobs.create(kind, trigger, options.startedBy)
    this.current = this.execute(job, options.snapshot).finally(() => {
      this.current = null
    })
    return job
  }

  /** resolves when the running job (if any) is done */
  async idle(): Promise<void> {
    await this.current
  }

  private async execute(job: BackupJob, snapshot?: string): Promise<void> {
    const log = createWriteStream(this.jobs.logPath(job.id), { flags: 'a', mode: 0o600 })
    log.write(`${job.kind} (${job.trigger}${job.startedBy ? `, ${job.startedBy}` : ''}) started ${job.startedAt}\n`)
    let outcome: Outcome
    try {
      outcome = await this.steps(job.kind, log, snapshot)
    } catch (err) {
      outcome = { result: 'failed', summary: `ไม่สำเร็จ: ${(err as Error).message}` }
    }
    log.write(`\n${outcome.result}: ${outcome.summary}\n`)
    await new Promise<void>((resolve) => log.end(resolve))
    const done = this.jobs.finish(job.id, outcome.result, outcome.summary, outcome.snapshot)
    await this.onFinished(done)
  }

  private async steps(kind: BackupJobKind, log: WriteStream, snapshot?: string): Promise<Outcome> {
    if (kind === 'backup') {
      const backup = await this.run('backup.sh', [], log)
      const saved = snapshotSaved(backup.output)
      if (backup.code !== 0)
        return { result: 'failed', summary: `สำรองไม่สำเร็จ: ${failureReason(backup.output)}`, ...(saved ? { snapshot: saved } : {}) }
      const verify = await this.run('verify.sh', [], log)
      return this.verified(verify, `สำรองแล้ว ${saved ?? ''}`.trim(), saved)
    }
    if (kind === 'verify') {
      return this.verified(await this.run('verify.sh', [], log), 'ตรวจแล้ว')
    }

    // drill: into the scratch database, never the live one
    const { restoreUri, drillDb } = this.config.mongo
    const from = this.config.storage.offsite ? 'off' : 'src'
    await this.drop(restoreUri, drillDb, log)
    try {
      const restore = await this.run('restore.sh', ['--to-db', drillDb, '--from', from, ...(snapshot ? ['--file', snapshot] : [])], log)
      const used = snapshotFetched(restore.output) ?? snapshot
      if (restore.code !== 0)
        return { result: 'failed', summary: `กู้ลงฐานซ้อมไม่สำเร็จ: ${failureReason(restore.output)}`, ...(used ? { snapshot: used } : {}) }
      const verify = await this.run('verify.sh', ['restore', '--db', drillDb, '--from', from], log)
      return this.verified(verify, `ซ้อมกู้ ${used ?? ''} ลง ${drillDb}`.replace(/\s+/g, ' '), used)
    } finally {
      await this.drop(restoreUri, drillDb, log)
    }
  }

  private verified(verify: StepResult, done: string, snapshot?: string): Outcome {
    const extra = snapshot ? { snapshot } : {}
    if (verify.code !== 0) return { result: 'failed', summary: `${done} แต่ตรวจไม่ผ่าน: ${failureReason(verify.output)}`, ...extra }
    const warnings = warningsOf(verify.output)
    if (warnings) return { result: 'warning', summary: `${done}, ตรวจผ่าน มีคำเตือน ${warnings} ข้อ (ดู log)`, ...extra }
    return { result: 'ok', summary: `${done}, ตรวจผ่าน`, ...extra }
  }

  /** the drill's scratch database, before and after: a failure is logged, not fatal (restore --drop replaces what it restores) */
  private async drop(uri: string, db: string, log: WriteStream): Promise<void> {
    try {
      await this.dropDatabase(uri, db)
      log.write(`dropped ${db}\n`)
    } catch (err) {
      log.write(`could not drop ${db}: ${(err as Error).message} (the login needs dbAdmin on it)\n`)
    }
  }
}
