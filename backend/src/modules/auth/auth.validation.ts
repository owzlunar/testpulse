import Joi from 'joi'
import { PASSWORD_MIN_LENGTH } from '#core/auth/password.js'
import { idParams } from '#core/http/validate.js'
import { userFieldRules } from '#modules/user/index.js'

const password = Joi.string().min(PASSWORD_MIN_LENGTH).max(128)
const inviteToken = Joi.object({
  token: Joi.string()
    .pattern(/^[\w-]{20,100}$/)
    .required(),
})

export const authValidation = {
  login: { body: Joi.object({ email: Joi.string().trim().max(254).required(), password: Joi.string().max(128).required() }) },
  register: {
    body: Joi.object({
      name: userFieldRules.name.required(),
      email: userFieldRules.email.required(),
      title: userFieldRules.title,
      password: password.required(),
    }),
  },
  inviteInfo: { params: inviteToken },
  acceptInvite: { params: inviteToken, body: Joi.object({ password: password.required() }) },
  resendInvite: { params: idParams },
  changePassword: { body: Joi.object({ currentPassword: Joi.string().max(128).required(), newPassword: password.required() }) },
}
