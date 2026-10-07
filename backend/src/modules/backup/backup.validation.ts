import Joi from 'joi'

const scheduleEntry = Joi.object({
  enabled: Joi.boolean().required(),
  cron: Joi.string().trim().min(9).max(100).required(),
  staleAfterHours: Joi.number()
    .integer()
    .min(1)
    .max(24 * 60)
    .required(),
})

/** a secret: a URL to set, null to remove, absent to keep */
const secretUrl = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(2000)
  .allow(null)

export const backupValidation = {
  start: {
    body: Joi.object({
      kind: Joi.string().valid('backup', 'verify', 'drill').required(),
      snapshot: Joi.string()
        .pattern(/^[\w.-]+-\d{8}-\d{6}\.archive\.gz$/)
        .when('kind', { is: 'drill', then: Joi.optional(), otherwise: Joi.forbidden() }),
    }),
  },
  jobId: {
    params: Joi.object({
      id: Joi.string()
        .pattern(/^job-[\w-]+$/)
        .max(64)
        .required(),
    }),
  },
  settings: {
    body: Joi.object({
      schedule: Joi.object({ backup: scheduleEntry.required(), drill: scheduleEntry.required() }).required(),
      alerts: Joi.object({
        emailEnabled: Joi.boolean().required(),
        teamIds: Joi.array().items(Joi.string().max(64)).max(50).required(),
        extraEmails: Joi.array().items(Joi.string().trim().email().max(254)).max(50).required(),
        teamsEnabled: Joi.boolean().required(),
        teamsWebhookUrl: secretUrl,
        kumaBackupUrl: secretUrl,
        kumaDrillUrl: secretUrl,
      }).required(),
    }),
  },
  /** what the agent sends (src/agent/alerts.ts) */
  agentEvent: {
    body: Joi.object({
      state: Joi.string().valid('problem', 'recovered', 'test').required(),
      key: Joi.string().max(40).required(),
      title: Joi.string().max(200).required(),
      message: Joi.string().max(2000).allow('').required(),
      severity: Joi.string().valid('error', 'warning', 'success', 'info').required(),
      recipients: Joi.object({
        emailEnabled: Joi.boolean().required(),
        teamIds: Joi.array().items(Joi.string().max(64)).max(50).required(),
        extraEmails: Joi.array().items(Joi.string().trim().email().max(254)).max(50).required(),
      }).required(),
    }),
  },
}
