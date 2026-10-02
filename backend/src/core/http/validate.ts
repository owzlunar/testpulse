import type { RequestHandler } from 'express'
import Joi from 'joi'
import { ApiError } from './errors.js'

// Validates and converts the parts of a request a route declares. Unknown body fields are dropped
// (mass assignment), so a client can never set computed or server-owned fields.

export interface RequestSchema {
  params?: Joi.Schema
  query?: Joi.Schema
  body?: Joi.Schema
}

export const validate =
  (schema: RequestSchema): RequestHandler =>
  (req, _res, next) => {
    for (const part of ['params', 'query', 'body'] as const) {
      const partSchema = schema[part]
      if (!partSchema) continue
      const { value, error } = partSchema.validate(req[part] ?? {}, {
        abortEarly: false,
        stripUnknown: true,
        errors: { wrap: { label: false } },
      })
      if (error) {
        const errors = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }))
        return next(ApiError.badRequest(`ข้อมูลไม่ถูกต้อง: ${errors.map((e) => e.field || e.message).join(', ')}`, errors))
      }
      // Express 5: req.query is a getter, so replace the property instead of assigning to it
      Object.defineProperty(req, part, { value, writable: true, configurable: true, enumerable: true })
    }
    next()
  }

/** ids are server-made strings like "proj-lq3k9x2a" or "role-admin" */
export const idSchema = Joi.string()
  .trim()
  .pattern(/^[a-zA-Z0-9_-]{1,64}$/)
export const idParams = Joi.object({ id: idSchema.required() })
