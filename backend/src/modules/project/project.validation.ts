import Joi from 'joi'
import { PROJECT_KEY_PATTERN } from '#contract/rules/project.js'
import { idParams, idSchema } from '#core/http/validate.js'

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)

const projectBody = Joi.object({
  key: Joi.string().trim().uppercase().pattern(PROJECT_KEY_PATTERN).required(),
  name: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().allow('').max(2000).default(''),
  logo: Joi.string().allow('').max(2048),
  targetDeadline: date.allow(''),
  status: Joi.string().valid('active', 'in_review', 'completed', 'archived').required(),
  tags: Joi.array().items(Joi.string().trim().max(40)).max(30).default([]),
  milestones: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().max(64).required(),
        title: Joi.string().trim().min(1).max(200).required(),
        date: date.required(),
        type: Joi.string().valid('code_freeze', 'uat_signoff', 'go_live').required(),
        description: Joi.string().allow('').max(1000),
      }),
    )
    .max(50)
    .default([]),
  teamIds: Joi.array().items(idSchema).max(100).default([]),
})

export const projectValidation = {
  create: { body: projectBody },
  update: { params: idParams, body: projectBody },
  remove: { params: idParams },
}
