import type { Request, Response } from 'express'
import type { BackupJobKind, BackupSettingsInput } from '#contract/types.js'
import { principal } from '#core/auth/guards.js'
import { send } from '#core/http/response.js'
import { type AgentEvent, backupService } from './backup.service.js'

export const backupController = {
  /** GET /backup/status */
  status: async (_req: Request, res: Response) => send(res, await backupService.status()),
  /** GET /backup/jobs */
  jobs: async (_req: Request, res: Response) => send(res, await backupService.jobs()),
  /** GET /backup/jobs/:id/log */
  jobLog: async (req: Request, res: Response) => send(res, await backupService.jobLog(String(req.params.id))),
  /** POST /backup/jobs */
  start: async (req: Request, res: Response) => {
    const { kind, snapshot } = req.body as { kind: BackupJobKind; snapshot?: string }
    send(res, await backupService.start(principal(), kind, snapshot), 202)
  },
  /** GET /backup/snapshots */
  snapshots: async (_req: Request, res: Response) => send(res, await backupService.snapshots()),
  /** GET /backup/settings */
  settings: async (_req: Request, res: Response) => send(res, await backupService.settings()),
  /** PUT /backup/settings */
  saveSettings: async (req: Request, res: Response) => send(res, await backupService.saveSettings(req.body as BackupSettingsInput)),
  /** POST /backup/alerts/test */
  testAlerts: async (_req: Request, res: Response) => send(res, await backupService.testAlerts()),
  /** POST /backup/agent-events (the agent, not a person) */
  agentEvent: async (req: Request, res: Response) => send(res, await backupService.agentEvent(req.body as AgentEvent)),
}
