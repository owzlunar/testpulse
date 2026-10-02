import type { ErrorRequestHandler, RequestHandler } from 'express'
import { logger } from '../config/logger.js'
import { sanitizeUrl } from '../config/redact.js'
import { requestContext } from './context.js'
import { ApiError } from './errors.js'
import type { ErrorBody } from './response.js'

interface ErrorLike {
  name?: string
  code?: number | string
  type?: string
  status?: number
  path?: string
  keyValue?: Record<string, unknown>
  errors?: Record<string, { path: string; message: string }>
}

/** turns library errors (Mongoose, body parser, multer) into ApiError; anything else stays a 500 */
export function normalizeError(err: unknown): ApiError | null {
  if (err instanceof ApiError) return err
  const e = (err ?? {}) as ErrorLike
  if (e.name === 'CastError') return ApiError.badRequest(`รูปแบบ ${e.path ?? 'id'} ไม่ถูกต้อง`)
  if (e.name === 'ValidationError' && e.errors) {
    const errors = Object.values(e.errors).map((x) => ({ field: x.path, message: x.message }))
    return ApiError.badRequest('ข้อมูลไม่ถูกต้อง', errors)
  }
  if (e.code === 11000) {
    const field = Object.keys(e.keyValue ?? {})[0]?.replace(/_bidx$/, '') ?? 'ข้อมูล'
    return ApiError.conflict(`${field} นี้มีอยู่แล้ว`, 'duplicate')
  }
  if (e.type === 'entity.too.large' || e.status === 413) return new ApiError(413, 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป', 'too_large')
  if (e.type === 'entity.parse.failed') return ApiError.badRequest('รูปแบบ JSON ไม่ถูกต้อง')
  if (e.name === 'MulterError') {
    return e.code === 'LIMIT_FILE_SIZE' ? new ApiError(413, 'ไฟล์มีขนาดใหญ่เกินไป', 'too_large') : ApiError.badRequest('อัปโหลดไฟล์ไม่สำเร็จ')
  }
  return null
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const known = normalizeError(err)
  const status = known?.status ?? 500
  const requestId = requestContext()?.requestId
  const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger)
  log(`${req.method} ${sanitizeUrl(req.originalUrl)} -> ${status}: ${(err as Error)?.message ?? String(err)}`, {
    requestId,
    stack: status >= 500 ? (err as Error)?.stack : undefined,
  })
  const body: ErrorBody = known
    ? { status: false, message: known.message, code: known.code, errors: known.errors, requestId }
    : { status: false, message: 'เกิดข้อผิดพลาดในระบบ กรุณาแจ้งผู้ดูแลพร้อมรหัสอ้างอิง', code: 'internal', requestId }
  res.status(status).json(body)
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    status: false,
    message: `ไม่พบ ${req.method} ${sanitizeUrl(req.path)}`,
    code: 'not_found',
    requestId: requestContext()?.requestId,
  } satisfies ErrorBody)
}
