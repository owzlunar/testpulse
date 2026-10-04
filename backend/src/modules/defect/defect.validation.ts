import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

const text = (max: number) => Joi.string().allow('').max(max)
const caseId = Joi.string().pattern(/^[A-Za-z0-9_-]{1,40}$/)

const defectBody = Joi.object({
  title: Joi.string().trim().min(1).max(300).required(),
  description: text(10000).default(''),
  stepsToReproduce: text(10000).default(''),
  expected: text(5000).default(''),
  actual: text(5000).default(''),
  severity: Joi.string().valid('critical', 'major', 'minor', 'trivial').required(),
  status: Joi.string().valid('open', 'in_progress', 'fixed', 'retest', 'closed', 'rejected').required(),
  caseId: caseId.allow(''),
  runId: idSchema.allow(''),
  stepNumber: Joi.number().integer().min(1),
  assignee: text(120),
  externalKey: text(60),
  environmentId: idSchema.allow(''),
  cause: Joi.string().valid('code', 'environment').default('code'),
  evidence: Joi.array().items(Joi.string().max(2048)).max(20).default([]),
})

const defectId = Joi.object({
  id: Joi.string()
    .pattern(/^BUG-\d{1,9}$/)
    .required(),
})

export const defectValidation = {
  create: { params: Joi.object({ projectId: idSchema.required() }), body: defectBody },
  update: { params: defectId, body: defectBody },
  comment: { params: defectId, body: Joi.object({ text: Joi.string().trim().min(1).max(5000).required() }) },
  idParams,
}
