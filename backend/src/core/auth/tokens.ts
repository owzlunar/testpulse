import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'

// Access tokens: short-lived RS256 JWTs that carry only the user id (`sub`).
// Opaque tokens (refresh, invite): random bytes; the database keeps only their SHA-256.

const ALGORITHM = 'RS256'

export interface AccessTokenClaims {
  sub: string
}

export function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const expiresIn = config.auth.accessTokenTtlSec
  const token = jwt.sign({}, config.auth.privateKey, {
    algorithm: ALGORITHM,
    subject: userId,
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    expiresIn,
  })
  return { token, expiresIn }
}

/** throws on a bad signature, wrong algorithm / issuer / audience, or an expired token */
export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, config.auth.publicKey, {
    algorithms: [ALGORITHM],
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    clockTolerance: 5,
  })
  if (typeof payload === 'string' || !payload.sub) throw new Error('token without subject')
  return { sub: payload.sub }
}

export const randomToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
