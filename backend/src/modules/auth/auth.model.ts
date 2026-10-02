import mongoose, { Schema } from 'mongoose'
import { stringId } from '#core/database/ids.js'

// Opaque tokens are stored as SHA-256 hashes only; both collections expire documents by TTL index.

export interface RefreshTokenDoc {
  _id: string
  userId: string
  tokenHash: string
  /** every token from one sign-in shares a family: reusing a rotated token revokes the whole family */
  family: string
  expiresAt: Date
  revokedAt?: Date
  /** revoked because it was exchanged for a new token (not by sign-out or theft detection) */
  rotatedAt?: Date
  /** the whole sign-in was ended (sign-out, theft detection): no token of it works any more */
  familyRevokedAt?: Date
  createdAt: Date
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    _id: stringId('rt'),
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    revokedAt: { type: Date },
    rotatedAt: { type: Date },
    familyRevokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'refresh_tokens' },
)

export const RefreshTokenModel = mongoose.model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema)

export interface InviteDoc {
  _id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  usedAt?: Date
  createdAt: Date
}

const inviteSchema = new Schema<InviteDoc>(
  {
    _id: stringId('inv'),
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    usedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'invites' },
)

export const InviteModel = mongoose.model<InviteDoc>('Invite', inviteSchema)
