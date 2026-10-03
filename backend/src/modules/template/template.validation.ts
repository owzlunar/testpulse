import Joi from 'joi'
import { idParams } from '#core/http/validate.js'

const text = (max: number) => Joi.string().allow('').max(max)

const draft = Joi.object({
  name: Joi.string().trim().min(1).max(300).required(),
  testScenario: text(5000).default(''),
  description: text(10000),
  prerequisite: text(5000).default(''),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
  steps: Joi.array()
    .items(Joi.object({ action: text(5000).default(''), testData: text(5000).default(''), expectedResult: text(5000).default('') }))
    .max(200)
    .default([]),
  expectedResults: text(10000).default(''),
})

export const templateValidation = {
  create: {
    body: Joi.object({
      name: Joi.string().trim().min(1).max(200).required(),
      category: Joi.string().trim().min(1).max(100).required(),
      description: text(2000).default(''),
      draft: draft.required(),
    }),
  },
  byId: { params: idParams },
}
