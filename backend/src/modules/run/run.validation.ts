import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

const date = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .allow('')
const caseId = Joi.string().pattern(/^[A-Za-z0-9_-]{1,40}$/)
const imageList = Joi.array().items(Joi.string().max(2048)).max(20).default([])
const resultStatus = Joi.string().valid('untested', 'passed', 'failed', 'blocked', 'skipped')

const runFields = {
  name: Joi.string().trim().min(1).max(200),
  type: Joi.string().valid('smoke', 'functional', 'regression', 'uat'),
  round: Joi.number().integer().min(1).max(999),
  environmentId: idSchema,
  build: Joi.string().allow('').max(120),
  plannedStart: date,
  plannedEnd: date,
}

export const runValidation = {
  create: {
    params: Joi.object({ projectId: idSchema.required() }),
    body: Joi.object({
      ...runFields,
      name: runFields.name.required(),
      type: runFields.type.required(),
      round: runFields.round.required(),
      environmentId: runFields.environmentId.required(),
      caseIds: Joi.array().items(caseId).min(1).max(5000).required(),
      assignee: Joi.string().allow('').max(120),
    }),
  },
  update: { params: idParams, body: Joi.object({ ...runFields, status: Joi.string().valid('planned', 'in_progress', 'completed') }).min(1) },
  saveResult: {
    params: Joi.object({ id: idSchema.required(), caseId: caseId.required() }),
    body: Joi.object({
      status: resultStatus.required(),
      stepResults: Joi.array()
        .items(
          Joi.object({
            stepId: Joi.string().max(80).required(),
            status: resultStatus.required(),
            actual: Joi.string().allow('').max(5000).default(''),
            evidence: imageList,
          }),
        )
        .max(200)
        .default([]),
      actualResults: Joi.string().allow('').max(10000).default(''),
      evidence: imageList,
      defectIds: Joi.array().items(Joi.string().max(40)).max(100).default([]),
      notes: Joi.string().allow('').max(5000).default(''),
    }),
  },
  remove: { params: idParams },
}
