import type { Request } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { currentPrincipal } from './context.js'
import type { ErrorBody } from './response.js'

const keyOf = (req: Request) => currentPrincipal()?.id ?? ipKeyGenerator(req.ip ?? '')

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: keyOf,
    message: { status: false, message, code: 'rate_limited' } satisfies ErrorBody,
  })

/** whole API, per user (or IP before sign-in) */
export const globalRateLimit = limiter(15 * 60 * 1000, 1000, 'มีการเรียกใช้งานมากเกินไป กรุณาลองใหม่ภายหลัง')
/** sign-in, register, invites: slows down password guessing */
export const authRateLimit = limiter(60 * 1000, 20, 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 1 นาที')
