import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

/** a confirmation to oneself (POST /notifications): the only notification a client may create */
const ownBody = Joi.object({
  type: Joi.string().valid('SYSTEM').required(),
  title: Joi.string().trim().min(1).max(200).required(),
  message: Joi.string().allow('').max(2000).default(''),
  severity: Joi.string().valid('info', 'warning', 'error', 'success').required(),
  projectId: idSchema,
  to: Joi.object({ userIds: Joi.array().items(idSchema).length(1).required() }).required(),
})

export const notificationValidation = {
  create: { body: ownBody },
  byId: { params: idParams },
}
