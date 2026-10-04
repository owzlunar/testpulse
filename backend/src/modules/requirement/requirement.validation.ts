import Joi from 'joi'
import { searchQuery } from '#core/http/search.js'
import { idParams, idSchema } from '#core/http/validate.js'

const fields = {
  code: Joi.string().trim().min(1).max(40).required(),
  title: Joi.string().trim().min(1).max(300).required(),
  description: Joi.string().allow('').max(5000).default(''),
  type: Joi.string().valid('functional', 'non_functional', 'business_rule').required(),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  status: Joi.string().valid('draft', 'approved', 'changed', 'deprecated').required(),
  // older clients don't send it: what they add is on top of the TOR
  origin: Joi.string().valid('tor', 'additional').default('additional'),
  // a TOR requirement names its clause ("4.2.1"); an additional one has none
  torClause: Joi.when('origin', {
    is: 'tor',
    then: Joi.string().trim().min(1).max(40).required(),
    otherwise: Joi.any().strip(),
  }),
  source: Joi.string().allow('').max(300),
  acceptanceCriteria: Joi.array().items(Joi.string().trim().max(1000)).max(100).default([]),
}
const requirementBody = Joi.object(fields)
/** an imported row: without a code it gets the next free one */
const importRow = Joi.object({ ...fields, code: Joi.string().trim().max(40).allow('') })

export const requirementValidation = {
  search: { query: searchQuery },
  create: { params: Joi.object({ projectId: idSchema.required() }), body: requirementBody },
  update: { params: idParams, body: requirementBody },
  import: {
    params: Joi.object({ projectId: idSchema.required() }),
    body: Joi.object({ requirements: Joi.array().items(importRow).min(1).max(1000).required(), updateExisting: Joi.boolean().default(false) }),
  },
  remove: { params: idParams },
}
