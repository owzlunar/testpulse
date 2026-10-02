import type { RequestHandler } from 'express'
import type { PermissionKey } from '#contract/types.js'
import { currentPrincipal, requestContext } from '../http/context.js'
import { ApiError } from '../http/errors.js'
import { can, resolvePrincipal, type Principal } from './principal.js'
import { verifyAccessToken } from './tokens.js'

// Access policy of a route, declared where the route is defined:
//   authenticate                    signed in (a user without a role passes: dashboard / settings)
//   requireRole                     signed in and has a role
//   requirePermission(key | keys)   the role has one of the permissions
//   requireAdmin                    the built-in Admin role
// Project access (team membership) is checked by the services that know the project.

export const authenticate: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ')
  if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized())
  let userId: string
  try {
    userId = verifyAccessToken(token).sub
  } catch {
    return next(ApiError.unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'))
  }
  const principal = await resolvePrincipal(userId)
  if (!principal) return next(ApiError.unauthorized('บัญชีนี้ใช้งานไม่ได้แล้ว'))
  const context = requestContext()
  if (context) context.principal = principal
  next()
}

/** the signed-in user (only inside routes behind `authenticate`) */
export function principal(): Principal {
  const p = currentPrincipal()
  if (!p) throw ApiError.unauthorized()
  return p
}

export const assertRole = (p: Principal) => {
  if (!p.roleId) throw ApiError.forbidden('บัญชีนี้ยังไม่มี Role ติดต่อ Admin')
}

export const assertAdmin = (p: Principal) => {
  if (!p.isAdmin) throw ApiError.forbidden('เฉพาะ Admin เท่านั้น')
}

export function assertCan(p: Principal, need: PermissionKey | PermissionKey[]): void {
  assertRole(p)
  const keys = Array.isArray(need) ? need : [need]
  if (!keys.some((k) => can(p, k))) throw ApiError.forbidden(`Role ${p.roleName} ไม่มีสิทธิ์ทำรายการนี้ (${keys.join(' หรือ ')})`)
}

const guard =
  (check: (p: Principal) => void): RequestHandler =>
  (_req, _res, next) => {
    check(principal())
    next()
  }

export const requireRole = guard(assertRole)
export const requireAdmin = guard(assertAdmin)
export const requirePermission = (need: PermissionKey | PermissionKey[]) => guard((p) => assertCan(p, need))
