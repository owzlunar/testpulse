import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

const TONES = ['primary', 'secondary', 'info', 'success', 'warning', 'caution', 'error']

const roleBody = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  description: Joi.string().allow('').max(500).default(''),
  discipline: Joi.string().valid('qa', 'dev', 'other').required(),
  tone: Joi.string()
    .valid(...TONES)
    .required(),
  icon: Joi.string()
    .pattern(/^tabler:[a-z0-9-]+$/)
    .required(),
  // unknown keys are dropped by the service, not refused (an older client may send retired ones)
  permissions: Joi.array().items(Joi.string().max(64)).max(100).default([]),
})

export const roleValidation = {
  create: { body: roleBody },
  update: { params: idParams, body: roleBody },
  remove: { params: idParams, query: Joi.object({ moveTo: idSchema.allow('', null).empty(['', null]).default(null) }) },
}
