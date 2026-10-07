import { describe, expect, it } from 'vitest'
import type { BackupJob } from '#contract/types.js'
import { JobStore } from '../jobs.js'
import { BusyError, failureReason, Runner, type ScriptRunner, type StepResult } from '../runner.js'
import { testConfig } from './helpers.js'

// The scripts' real output lines, as the runner reads them.
const SAVED = '2026-10-06 02:00:03 [backup] saved src/testpulse-backups/db/testpulse-20261006-020000.archive.gz (11627 bytes)\n'
const PASSED = '2026-10-06 02:00:09 [verify] passed (0 warning(s))\n'
const WARNED = 'WARN  projects  live 3 / restored 2\n2026-10-06 02:00:09 [verify] passed (2 warning(s))\n'
const FETCHED = '2026-10-06 03:00:01 [restore] fetching off/testpulse-backups/db/testpulse-20261006-020000.archive.gz\n'

function setup(answers: Record<string, StepResult>) {
  const config = testConfig()
  const jobs = new JobStore(config.dataDir)
  const calls: string[] = []
  const dropped: string[] = []
  const run: ScriptRunner = async (script, args, log) => {
    const call = [script, ...args].join(' ')
    calls.push(call)
    const answer = answers[call] ?? answers[script] ?? { code: 0, output: '' }
    log.write(answer.output)
    return answer
  }
  const finished: BackupJob[] = []
  const runner = new Runner(
    config,
    jobs,
    run,
    async (_uri, db) => {
      dropped.push(db)
    },
    (job) => {
      finished.push(job)
    },
  )
  return { runner, jobs, calls, dropped, finished }
}

describe('Runner', () => {
  it('backs up, then verifies; records the snapshot and the log', async () => {
    const { runner, jobs, calls, finished } = setup({ 'backup.sh': { code: 0, output: SAVED }, 'verify.sh': { code: 0, output: PASSED } })
    const job = runner.start('backup', 'manual', { startedBy: 'Admin' })
    expect(job).toMatchObject({ kind: 'backup', trigger: 'manual', startedBy: 'Admin', result: 'running' })
    await runner.idle()

    expect(calls).toEqual(['backup.sh', 'verify.sh'])
    expect(finished[0]).toMatchObject({
      result: 'ok',
      snapshot: 'testpulse-20261006-020000.archive.gz',
      summary: 'สำรองแล้ว testpulse-20261006-020000.archive.gz, ตรวจผ่าน',
    })
    expect(jobs.readLog(job.id)).toContain('saved src/testpulse-backups')
  })

  it('reports the script error, and warnings of a passed check', async () => {
    const failed = setup({ 'backup.sh': { code: 1, output: '[backup] ERROR: mongodump failed\n' } })
    failed.runner.start('backup', 'schedule')
    await failed.runner.idle()
    expect(failed.calls).toEqual(['backup.sh'])
    expect(failed.finished[0]).toMatchObject({ result: 'failed', summary: 'สำรองไม่สำเร็จ: mongodump failed' })

    const warned = setup({ 'verify.sh': { code: 0, output: WARNED } })
    warned.runner.start('verify', 'manual')
    await warned.runner.idle()
    expect(warned.finished[0]).toMatchObject({ result: 'warning', summary: 'ตรวจแล้ว, ตรวจผ่าน มีคำเตือน 2 ข้อ (ดู log)' })
  })

  it('drills into the scratch database only, dropping it before and after', async () => {
    const { runner, calls, dropped, finished } = setup({ 'restore.sh': { code: 0, output: FETCHED }, verify: { code: 0, output: PASSED } })
    runner.start('drill', 'manual', { snapshot: 'testpulse-20261006-020000.archive.gz' })
    await runner.idle()
    expect(calls).toEqual([
      'restore.sh --to-db testpulse-restore --from off --file testpulse-20261006-020000.archive.gz',
      'verify.sh restore --db testpulse-restore --from off',
    ])
    expect(dropped).toEqual(['testpulse-restore', 'testpulse-restore'])
    expect(finished[0]).toMatchObject({ result: 'ok', snapshot: 'testpulse-20261006-020000.archive.gz' })
  })

  it('runs one job at a time', async () => {
    const { runner } = setup({})
    runner.start('verify', 'manual')
    expect(() => runner.start('backup', 'manual')).toThrow(BusyError)
    await runner.idle()
    expect(() => runner.start('backup', 'manual')).not.toThrow()
    await runner.idle()
  })

  it('takes the reason from ERROR, else the first FAIL line', () => {
    expect(failureReason('x\n2026 [verify] ERROR: no settings file\n')).toBe('no settings file')
    expect(failureReason('ok  a\nFAIL  testpulse: 1 object(s) not off-site\nFAIL  b\n')).toBe('testpulse: 1 object(s) not off-site')
    expect(failureReason('')).toBe('ไม่สำเร็จ (ดู log)')
  })
})
