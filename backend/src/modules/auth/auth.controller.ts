import type { CookieOptions, Request, Response } from 'express'
import { principal } from '#core/auth/guards.js'
import { config } from '#core/config/env.js'
import { done, send } from '#core/http/response.js'
import { authService, type IssuedSession } from './auth.service.js'

// The refresh token lives in an httpOnly cookie scoped to the auth routes: scripts can't read it and
// no other request carries it.
export const REFRESH_COOKIE = 'tp_refresh'

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.auth.cookieSecure,
  sameSite: 'strict',
  // the path the browser sees (behind a proxy on a sub path: /testpulse/api/v1/auth)
  path: `${config.publicApiPath}/auth`,
  maxAge: config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
})

const respondWithSession = (res: Response, { session, refreshToken }: IssuedSession, status = 200) => {
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions())
  return send(res, session, status)
}

const refreshCookie = (req: Request): string | undefined => (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE]

export const authController = {
  /** POST /auth/login { email, password } */
  login: async (req: Request, res: Response) => respondWithSession(res, await authService.login(req.body.email, req.body.password)),
  /** POST /auth/refresh (cookie) */
  refresh: async (req: Request, res: Response) => {
    try {
      return respondWithSession(res, await authService.refresh(refreshCookie(req)))
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined })
      throw err
    }
  },
  /** POST /auth/logout (cookie) */
  logout: async (req: Request, res: Response) => {
    await authService.logout(refreshCookie(req))
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined })
    return done(res)
  },
  /** POST /auth/register { name, email, title?, password } */
  register: async (req: Request, res: Response) => respondWithSession(res, await authService.register(req.body), 201),
  /** GET /auth/me */
  me: async (_req: Request, res: Response) => send(res, await authService.me(principal())),
  /** GET /auth/invites/:token */
  inviteInfo: async (req: Request, res: Response) => send(res, await authService.inviteInfo(req.params.token as string)),
  /** POST /auth/invites/:token/accept { password } */
  acceptInvite: async (req: Request, res: Response) =>
    respondWithSession(res, await authService.acceptInvite(req.params.token as string, req.body.password)),
  /** POST /users/:id/invite (Admin): send the invite again */
  resendInvite: async (req: Request, res: Response) => {
    await authService.invite(req.params.id as string)
    return done(res)
  },
  /** PUT /me/password { currentPassword, newPassword } -> a new session (other sessions are signed out) */
  changePassword: async (req: Request, res: Response) =>
    respondWithSession(res, await authService.changePassword(principal(), req.body.currentPassword, req.body.newPassword)),
}
