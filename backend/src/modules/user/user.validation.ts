import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

export const userFieldRules = {
  name: Joi.string().trim().min(1).max(120),
  email: Joi.string().trim().lowercase().email({ tlds: false }).max(254),
  title: Joi.string().trim().allow('').max(120),
  avatar: Joi.string().trim().allow('').max(2048),
}

export const userValidation = {
  invite: {
    body: Joi.object({
      ...userFieldRules,
      name: userFieldRules.name.required(),
      email: userFieldRules.email.required(),
      roleId: idSchema.allow(null).default(null),
    }),
  },
  update: {
    params: idParams,
    body: Joi.object({ ...userFieldRules, roleId: idSchema.allow(null) }).min(1),
  },
}
