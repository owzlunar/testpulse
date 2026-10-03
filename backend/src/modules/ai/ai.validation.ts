import Joi from 'joi'

export const aiValidation = {
  draft: {
    body: Joi.object({
      requirement: Joi.string().trim().min(1).max(10000).required(),
      options: Joi.object({
        positive: Joi.boolean().required(),
        negative: Joi.boolean().required(),
        boundary: Joi.boolean().required(),
        context: Joi.string().trim().allow('').max(2000),
      }).required(),
    }),
  },
}
