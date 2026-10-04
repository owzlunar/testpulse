import Joi from 'joi'
import { idParams, idSchema } from '#core/http/validate.js'

const text = (max: number) => Joi.string().allow('').max(max)
const title = Joi.string().trim().min(1).max(300)
const docNumber = Joi.string().trim().min(1).max(80)

/** who signs; signing itself (status, time, comment) is the server's */
const signatories = Joi.array()
  .items(Joi.object({ role: text(120).default(''), name: text(120).default(''), position: text(120).default('') }))
  .max(10)

const uat = Joi.object({
  testPeriod: text(200).default(''),
  environmentId: idSchema.allow(''),
  environment: text(200).default(''),
  decision: Joi.string().valid('accepted', 'conditional', 'rejected').required(),
  remarks: text(5000).default(''),
  riskAcknowledged: Joi.boolean().default(false),
})

const options = Joi.object({
  runId: idSchema.allow(''),
  includeSubCases: Joi.boolean().required(),
  includeSteps: Joi.boolean().required(),
  includeEvidence: Joi.boolean().required(),
  includeDefects: Joi.boolean().required(),
  includeTraceability: Joi.boolean().required(),
  torOnly: Joi.boolean().default(false),
})

/** pictures are uploaded first (POST /files): a URL, never the picture itself */
const imageUrl = Joi.string()
  .allow('')
  .max(2048)
  .pattern(/^data:/, { invert: true })

export const documentValidation = {
  generate: {
    body: Joi.object({
      projectId: idSchema.required(),
      type: Joi.string().valid('test_spec', 'test_summary', 'uat', 'rtm').required(),
      title: title.required(),
      docNumber: docNumber.required(),
      options: options.required(),
      uat,
      signatories: signatories.default([]),
    }),
  },
  update: {
    params: idParams,
    body: Joi.object({ title, docNumber, signatories, uat, status: Joi.string().valid('pending_signoff') }).min(1),
  },
  sign: {
    params: Joi.object({ id: idSchema.required(), index: Joi.number().integer().min(0).max(9).required() }),
    body: Joi.object({ decision: Joi.string().valid('signed', 'rejected').required(), comment: text(1000).default('') }),
  },
  template: {
    body: Joi.object({
      companyName: text(200).required(),
      companyAddress: text(500).required(),
      logo: imageUrl.required(),
      docNumberPattern: Joi.string().trim().min(1).max(80).required(),
      headerNote: text(500).required(),
      footerNote: text(500).required(),
      defaultSignatories: Joi.array()
        .items(Joi.object({ role: text(120).required(), position: text(120).required() }))
        .max(10)
        .required(),
    }),
  },
  idParams,
}
