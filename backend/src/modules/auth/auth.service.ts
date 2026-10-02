import type { AuthSession, InviteInfo, User } from '#contract/types.js'
import { hashPassword, timingDummyHash, verifyPassword } from '#core/auth/password.js'
import type { Principal } from '#core/auth/principal.js'
import { hashToken, randomToken, signAccessToken } from '#core/auth/tokens.js'
import { config } from '#core/config/env.js'
import { logger } from '#core/config/logger.js'
import { ApiError } from '#core/http/errors.js'
import { getMailer } from '#core/mail/mailer.js'
import { accounts } from '#modules/user/index.js'
import { inviteRepository, refreshTokenRepository } from './auth.repository.js'
import { inviteMail } from './invite.mail.js'

// Sign-in and sessions. A session = a short access token (sent as Bearer) + a refresh token in an
// httpOnly cookie. Refresh tokens rotate on every use; presenting one that was already rotated means
// it was stolen (or replayed): the whole sign-in (token family) is revoked.

/** what a route answers, plus the refresh token the controller puts in the cookie */
export interface IssuedSession {
  session: AuthSession
  refreshToken: string
}

const BAD_CREDENTIALS = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
const INVALID_INVITE = 'ลิงก์เชิญหมดอายุหรือถูกใช้ไปแล้ว ติดต่อ Admin เพื่อขอลิงก์ใหม่'
const DAY_MS = 24 * 60 * 60 * 1000

async function issue(user: User, family = refreshTokenRepository.newFamily()): Promise<IssuedSession> {
  const refreshToken = randomToken()
  await refreshTokenRepository.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: new Date(Date.now() + config.auth.refreshTokenTtlDays * DAY_MS),
  })
  const { token, expiresIn } = signAccessToken(user.id)
  return { session: { user, accessToken: token, expiresIn }, refreshToken }
}

async function sendInvite(user: User): Promise<void> {
  const token = randomToken()
  await inviteRepository.expireAllOf(user.id)
  await inviteRepository.create({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + config.auth.inviteTtlHours * 60 * 60 * 1000),
  })
  await getMailer().send(inviteMail(user, `${config.baseUrl}/invite/${token}`, config.auth.inviteTtlHours))
}

export const authService = {
  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await accounts.findByEmail(email)
    const hash = user ? await accounts.passwordHashOf(user.id) : null
    // the same work whether or not the account exists, so timing doesn't reveal registered emails
    const valid = await verifyPassword(password, hash ?? (await timingDummyHash()))
    if (!user || !hash || !valid || user.status === 'invited') throw ApiError.unauthorized(BAD_CREDENTIALS)
    return issue(user)
  },

  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    const expired = ApiError.unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')
    if (!refreshToken) throw expired
    const stored = await refreshTokenRepository.findByHash(hashToken(refreshToken))
    if (!stored || stored.expiresAt <= new Date()) throw expired
    if (stored.revokedAt || !(await refreshTokenRepository.revoke(stored._id))) {
      logger.warn(`[auth] refresh token reused for user ${stored.userId}: revoking its sign-in`)
      await refreshTokenRepository.revokeFamily(stored.family)
      throw expired
    }
    const user = await accounts.findById(stored.userId)
    if (!user || user.status === 'invited') throw expired
    return issue(user, stored.family)
  },

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return
    const stored = await refreshTokenRepository.findByHash(hashToken(refreshToken))
    if (stored) await refreshTokenRepository.revoke(stored._id)
  },

  /** public sign-up: an active account without a role (an Admin gives one later) */
  async register(fields: { name: string; email: string; title?: string; password: string }): Promise<IssuedSession> {
    const { password, ...profile } = fields
    const user = await accounts.register(profile, await hashPassword(password))
    return issue(user)
  },

  /** event 'user.invited' and POST /users/:id/invite: mails a one-time link to set a password */
  async invite(userId: string): Promise<void> {
    const user = await accounts.findById(userId)
    if (!user) throw ApiError.notFound('ไม่พบผู้ใช้')
    if (user.status !== 'invited') throw ApiError.conflict('ผู้ใช้นี้ตั้งรหัสผ่านแล้ว', 'already_active')
    await sendInvite(user)
  },

  async inviteInfo(token: string): Promise<InviteInfo> {
    const invite = await inviteRepository.findUsable(hashToken(token))
    const user = invite && (await accounts.findById(invite.userId))
    if (!invite || !user || user.status !== 'invited') throw ApiError.notFound(INVALID_INVITE)
    return { name: user.name, email: user.email, expiresAt: invite.expiresAt.toISOString() }
  },

  async acceptInvite(token: string, password: string): Promise<IssuedSession> {
    const invite = await inviteRepository.findUsable(hashToken(token))
    if (!invite) throw ApiError.notFound(INVALID_INVITE)
    const passwordHash = await hashPassword(password)
    // claiming the invite is atomic: of two requests with the same link, only one gets past this
    if (!(await inviteRepository.markUsed(invite._id))) throw ApiError.notFound(INVALID_INVITE)
    return issue(await accounts.setPassword(invite.userId, passwordHash))
  },

  /** signs out every other session (their refresh tokens are revoked) and starts a new one */
  async changePassword(principal: Principal, currentPassword: string, newPassword: string): Promise<IssuedSession> {
    const hash = await accounts.passwordHashOf(principal.id)
    if (!(await verifyPassword(currentPassword, hash)))
      throw ApiError.badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง', [{ field: 'currentPassword', message: 'wrong' }])
    const user = await accounts.setPassword(principal.id, await hashPassword(newPassword))
    await refreshTokenRepository.revokeAllOf(principal.id)
    return issue(user)
  },

  me: async (principal: Principal): Promise<User> => (await accounts.findById(principal.id))!,
}
