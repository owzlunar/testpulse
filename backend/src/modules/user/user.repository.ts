import type { ClientSession } from 'mongoose'
import type { User } from '#contract/types.js'
import { BaseRepository } from '#core/database/base.repository.js'
import { blindIndex } from '#core/crypto/blind-index.js'
import { UserModel, type UserDoc } from './user.model.js'

export const emailIndex = (email: string) => blindIndex(email, 'users.email')

class UserRepository extends BaseRepository<UserDoc, User> {
  constructor() {
    super(UserModel, ['name', 'createdAt'], { createdAt: 1 })
  }

  findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email_bidx: emailIndex(email) } as never)
  }

  /** the stored password hash (never part of a User) */
  async passwordHashOf(id: string): Promise<string | null> {
    const doc = await UserModel.findById(id).select('+passwordHash')
    return doc?.passwordHash ?? null
  }

  withRole(roleId: string, session?: ClientSession): Promise<User[]> {
    return this.toApiListAsync(UserModel.find({ roleId }).session(session ?? null))
  }

  /** the ids among `ids` that belong to a user */
  /** ids of the users with these names (cases name their assigned QA / developer) */
  async idsByName(names: string[]): Promise<string[]> {
    if (!names.length) return []
    return (await UserModel.find({ name: { $in: names } }, { _id: 1 }).lean()).map((u) => u._id)
  }

  async existingIds(ids: string[]): Promise<string[]> {
    const found = await UserModel.find({ _id: { $in: ids } }, { _id: 1 }).lean()
    return found.map((u) => u._id)
  }

  countWithRole(roleId: string): Promise<number> {
    return UserModel.countDocuments({ roleId })
  }

  /** users of the role who can sign in (not waiting for an invite) */
  countActiveWithRole(roleId: string): Promise<number> {
    return UserModel.countDocuments({ roleId, status: 'active' })
  }

  /** users who can sign in (not waiting for an invite): of the role, or among the ids */
  activeWithRole(roleId: string): Promise<User[]> {
    return this.toApiListAsync(UserModel.find({ roleId, status: 'active' }))
  }

  activeAmong(ids: string[]): Promise<User[]> {
    if (!ids.length) return Promise.resolve([])
    return this.toApiListAsync(UserModel.find({ _id: { $in: ids }, status: 'active' }))
  }

  private async toApiListAsync(query: Promise<{ toJSON(): unknown }[]>): Promise<User[]> {
    return this.toApiList(await query)
  }
}

export const userRepository = new UserRepository()
