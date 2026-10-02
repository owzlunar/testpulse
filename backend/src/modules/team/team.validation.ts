import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

const teamBody = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  description: Joi.string().allow('').max(500).default(''),
  tone: Joi.string().valid('primary', 'secondary', 'info', 'success', 'warning', 'caution', 'error').required(),
  memberIds: Joi.array().items(idSchema).max(500).default([]),
})

export const teamValidation = {
  create: { body: teamBody },
  update: { params: idParams, body: teamBody },
  remove: { params: idParams },
}
