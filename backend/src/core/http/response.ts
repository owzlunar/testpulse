import type { Response } from 'express'
import type { FieldError } from './errors.js'

// Every response has the same envelope:
//   success  { status: true, data }
//   failure  { status: false, message, code?, errors?, requestId }

export interface SuccessBody<T> {
  status: true
  data: T
}

export interface ErrorBody {
  status: false
  message: string
  code?: string
  errors?: FieldError[]
  requestId?: string
}

export const send = <T>(res: Response, data: T, status = 200) => res.status(status).json({ status: true, data } satisfies SuccessBody<T>)
export const created = <T>(res: Response, data: T) => send(res, data, 201)
/** 200 with `data: null` rather than 204, so every response has the same envelope */
export const done = (res: Response) => send(res, null)
