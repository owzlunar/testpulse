import type { ClientSession } from 'mongoose'
import { newId } from '#core/database/ids.js'
import { InviteModel, RefreshTokenModel, type InviteDoc, type RefreshTokenDoc } from './auth.model.js'

export const refreshTokenRepository = {
  create: (doc: Pick<RefreshTokenDoc, 'userId' | 'tokenHash' | 'family' | 'expiresAt'>, session?: ClientSession) =>
    new RefreshTokenModel(doc).save({ session }),
  findByHash: (tokenHash: string) => RefreshTokenModel.findOne({ tokenHash }).lean(),
  /** exchanged for a new token; false when another request rotated it first */
  rotate: async (id: string) => {
    const now = new Date()
    return (await RefreshTokenModel.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: now, rotatedAt: now } })).modifiedCount === 1
  },

  /** ends the sign-in: every token of it, also the ones already rotated (no grace for them any more) */
  revokeFamily: async (family: string) => {
    const now = new Date()
    await RefreshTokenModel.updateMany({ family, revokedAt: null }, { $set: { revokedAt: now } })
    await RefreshTokenModel.updateMany({ family }, { $set: { familyRevokedAt: now } })
  },
  revokeAllOf: (userId: string, session?: ClientSession) =>
    RefreshTokenModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session }),
  newFamily: () => newId('fam'),
}

export const inviteRepository = {
  create: (doc: Pick<InviteDoc, 'userId' | 'tokenHash' | 'expiresAt'>) => new InviteModel(doc).save(),
  findUsable: (tokenHash: string) => InviteModel.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } }).lean(),
  markUsed: async (id: string, session?: ClientSession) =>
    (await InviteModel.updateOne({ _id: id, usedAt: null }, { $set: { usedAt: new Date() } }, { session })).modifiedCount === 1,
  /** a new invite replaces the earlier ones */
  expireAllOf: (userId: string) => InviteModel.updateMany({ userId, usedAt: null }, { $set: { expiresAt: new Date() } }),
}
