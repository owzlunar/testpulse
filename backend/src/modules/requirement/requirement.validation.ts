import Joi from 'joi'
import { searchQuery } from '#core/http/search.js'
import { idParams, idSchema } from '#core/http/validate.js'

const requirementBody = Joi.object({
  code: Joi.string().trim().min(1).max(40).required(),
  title: Joi.string().trim().min(1).max(300).required(),
  description: Joi.string().allow('').max(5000).default(''),
  type: Joi.string().valid('functional', 'non_functional', 'business_rule').required(),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  status: Joi.string().valid('draft', 'approved', 'changed', 'deprecated').required(),
  source: Joi.string().allow('').max(300),
  acceptanceCriteria: Joi.array().items(Joi.string().trim().max(1000)).max(100).default([]),
})

export const requirementValidation = {
  search: { query: searchQuery },
  create: { params: Joi.object({ projectId: idSchema.required() }), body: requirementBody },
  update: { params: idParams, body: requirementBody },
  remove: { params: idParams },
}
