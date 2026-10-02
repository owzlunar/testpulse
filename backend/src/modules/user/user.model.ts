import mongoose, { Schema } from 'mongoose'
import type { User, UserStatus } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { auditTrailPlugin } from '#core/database/plugins/audit-trail.js'
import { fieldEncryptionPlugin } from '#core/database/plugins/field-encryption.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

export interface UserDoc extends Omit<User, 'id' | 'status'> {
  _id: string
  status: UserStatus
  /** scrypt hash; missing while an invite is pending */
  passwordHash?: string
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDoc>(
  {
    _id: stringId('user'),
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // personal data: encrypted at rest, found by its blind index (one account per email)
    email: { type: String, required: true, trim: true, encrypted: true, blindIndex: 'users.email', blindIndexUnique: true },
    roleId: { type: String, default: null, index: true },
    title: { type: String, trim: true, maxlength: 120 },
    avatar: { type: String, default: '' },
    status: { type: String, enum: ['active', 'invited'], default: 'active' },
    passwordHash: { type: String, private: true },
  },
  { timestamps: true, collection: 'users' },
)

userSchema.plugin(fieldEncryptionPlugin)
userSchema.plugin(auditTrailPlugin, { targetType: 'USER', title: (d: Record<string, unknown>) => String(d.name) })
userSchema.plugin(toJSONPlugin)

export const UserModel = mongoose.model<UserDoc>('User', userSchema)
