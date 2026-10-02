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
  async existingIds(ids: string[]): Promise<string[]> {
    const found = await UserModel.find({ _id: { $in: ids } }, { _id: 1 }).lean()
    return found.map((u) => u._id)
  }

  countWithRole(roleId: string): Promise<number> {
    return UserModel.countDocuments({ roleId })
  }

  private async toApiListAsync(query: Promise<{ toJSON(): unknown }[]>): Promise<User[]> {
    return this.toApiList(await query)
  }
}

export const userRepository = new UserRepository()
