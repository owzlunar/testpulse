import Joi from 'joi'
import { idSchema } from '#core/http/validate.js'

const projectParams = Joi.object({ projectId: idSchema.required() })

export const reportValidation = {
  report: { params: projectParams },
  export: {
    params: projectParams,
    body: Joi.object({
      format: Joi.string().valid('markdown').required(),
      filename: Joi.string().trim().min(1).max(200).required(),
    }),
  },
}
