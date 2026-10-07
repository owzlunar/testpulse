import { describe, expect, it } from 'vitest'
import { fetchJobLog, fetchJobs, fetchSettings, fetchSnapshots, fetchStatus, saveSettings, startJob, testAlerts } from './backup'
import { USERS, refusal, signIn } from '../../../tests/helpers'

// The mock backup agent: Admin only, one job at a time, secrets never sent back (the backend's rules).

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('backup (mock agent)', () => {
  it('is for the Admin only', async () => {
    await signIn(USERS.qaLead)
    for (const call of [fetchStatus(), fetchJobs(), fetchSnapshots(), fetchSettings(), startJob('backup'), testAlerts()]) {
      expect((await refusal(call)).status).toBe(403)
    }
  })

  it('runs one job at a time; a finished backup adds a snapshot and its log', async () => {
    await signIn(USERS.admin)
    const before = (await fetchSnapshots()).length
    // asked together: the second finds the first still running (jobs finish at once in unit tests)
    const [job, second] = await Promise.all([startJob('backup'), refusal(startJob('verify'))])
    expect(job).toMatchObject({ kind: 'backup', trigger: 'manual', result: 'running', startedBy: expect.any(String) })
    expect(second.status).toBe(409)

    await tick()
    const done = (await fetchJobs()).find((j) => j.id === job.id)!
    expect(done).toMatchObject({ result: 'ok', snapshot: expect.stringMatching(/^testpulse-\d{8}-\d{6}\.archive\.gz$/) })
    expect(await fetchSnapshots()).toHaveLength(before + 1)
    expect(await fetchJobLog(job.id)).toContain(done.summary)
    expect((await fetchStatus()).lastBackup?.id).toBe(job.id)
  })

  it('drills only a snapshot that exists', async () => {
    await signIn(USERS.admin)
    expect((await refusal(startJob('drill', 'testpulse-19990101-020000.archive.gz'))).status).toBe(422)
    const [newest] = await fetchSnapshots()
    const job = await startJob('drill', newest!.name)
    await tick()
    expect((await fetchJobs()).find((j) => j.id === job.id)).toMatchObject({ result: 'ok', snapshot: newest!.name })
  })

  it('keeps secrets as "set" only; null removes, absent keeps', async () => {
    await signIn(USERS.admin)
    const { schedule } = await fetchSettings()
    const base = { schedule: { backup: schedule.backup, drill: schedule.drill } }
    const saved = await saveSettings({
      ...base,
      alerts: {
        emailEnabled: true,
        teamIds: ['team-payment'],
        extraEmails: ['Ops@Example.com'],
        teamsEnabled: true,
        teamsWebhookUrl: 'https://x.example.com/hook?sig=abc123',
      },
    })
    expect(saved.alerts).toMatchObject({ teamsWebhookSet: true, teamsWebhookHint: '…abc123', extraEmails: ['ops@example.com'] })
    expect(JSON.stringify(saved)).not.toContain('hook?sig')

    const kept = await saveSettings({ ...base, alerts: { emailEnabled: true, teamIds: [], extraEmails: [], teamsEnabled: true } })
    expect(kept.alerts.teamsWebhookSet).toBe(true)
    const removed = await saveSettings({
      ...base,
      alerts: { emailEnabled: true, teamIds: [], extraEmails: [], teamsEnabled: false, teamsWebhookUrl: null },
    })
    expect(removed.alerts.teamsWebhookSet).toBe(false)

    const bad = { ...base.schedule, backup: { ...schedule.backup, cron: 'every day' } }
    expect((await refusal(saveSettings({ schedule: bad, alerts: removed.alerts }))).status).toBe(422)
  })
})
