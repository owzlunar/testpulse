import Joi from 'joi'
import { idSchema } from '#core/http/validate.js'

// Images are file URLs (POST /files), never inline data: the case list carries every image link
const imageList = Joi.array().items(Joi.string().max(2048)).max(20)
const text = (max: number) => Joi.string().allow('').max(max)
const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)
const caseId = Joi.string()
  .trim()
  .pattern(/^[A-Za-z0-9_-]{1,40}$/)

const step = Joi.object({
  id: Joi.string().max(80).required(),
  stepNumber: Joi.number().integer().min(1).required(),
  action: text(5000).default(''),
  testData: text(5000).default(''),
  expectedResult: text(5000).default(''),
})

/** what a client may set on a case (anything else is the server's: history, review, archive, churn, rev) */
const caseFields = {
  name: Joi.string().trim().min(1).max(300),
  requirement: text(5000),
  requirementIds: Joi.array().items(idSchema).max(50),
  testScenario: text(5000),
  description: text(10000),
  prerequisite: text(5000),
  steps: Joi.array().items(step).max(200),
  expectedResults: text(10000),
  expectedImages: imageList,
  actualResults: text(10000),
  actualImages: imageList,
  status: Joi.string().valid('pending', 'ready_for_test', 'untested', 'in_progress', 'passed', 'failed', 'blocked'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  expiryDate: date.allow(''),
  assignedTo: text(120),
  assignedDev: text(120),
  rootCauseTag: text(120),
  executedBy: text(120),
  executedAt: Joi.string().isoDate().allow(''),
  version: Joi.string().pattern(/^v\d+\.\d+$/),
}

const newCase = Joi.object({
  ...caseFields,
  id: caseId.allow(''),
  numericId: Joi.number().integer().min(0).default(0),
  parentId: caseId.allow(null).default(null),
  name: caseFields.name.required(),
  status: caseFields.status.required(),
  priority: caseFields.priority.required(),
  steps: caseFields.steps.default([]),
})

const expected = Joi.object({ uid: idSchema.required(), rev: Joi.number().integer().min(0).required() })
const projectParams = Joi.object({ projectId: idSchema.required() })
const caseParams = Joi.object({ projectId: idSchema.required(), id: caseId.required() })
const withExpected = Joi.object({ expected })

export const testCaseValidation = {
  list: { params: projectParams },
  search: { query: Joi.object({ search: Joi.string().allow('').max(200).default(''), limit: Joi.number().integer().min(1).max(100).default(20) }) },
  create: { params: projectParams, body: Joi.object({ cases: Joi.array().items(newCase).min(1).max(500).required() }) },
  update: {
    params: caseParams,
    body: Joi.object({ patch: Joi.object({ ...caseFields, changeSummary: text(500), bumpMajor: Joi.boolean() }).required(), expected }),
  },
  restoreVersion: {
    params: caseParams.keys({
      version: Joi.string()
        .pattern(/^v\d+\.\d+$/)
        .required(),
    }),
    body: withExpected,
  },
  caseAction: { params: caseParams, body: withExpected },
  impact: { params: caseParams },
  extendDueDate: {
    params: caseParams,
    body: Joi.object({ newDate: date.required(), reason: Joi.string().trim().min(1).max(500).required(), expected }),
  },
  remove: { params: caseParams, body: withExpected },
  reorder: {
    params: projectParams,
    body: Joi.object({
      order: Joi.array()
        .items(Joi.object({ id: caseId.required(), subIds: Joi.array().items(caseId).max(500).default([]) }))
        .max(5000)
        .required(),
      uids: Joi.object().pattern(caseId, idSchema),
    }),
  },
}
