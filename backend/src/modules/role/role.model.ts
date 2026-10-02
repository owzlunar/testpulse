import mongoose, { Schema } from 'mongoose'
import type { PermissionKey, Role } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { auditTrailPlugin } from '#core/database/plugins/audit-trail.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

export interface RoleDoc extends Omit<Role, 'id' | 'createdAt' | 'updatedAt'> {
  _id: string
  /** lower-cased name: names are unique regardless of case */
  nameKey: string
  createdAt: Date
  updatedAt: Date
}

const TONES = ['primary', 'secondary', 'info', 'success', 'warning', 'caution', 'error']

const roleSchema = new Schema<RoleDoc>(
  {
    _id: stringId('role'),
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, unique: true, private: true },
    description: { type: String, default: '', maxlength: 500 },
    discipline: { type: String, enum: ['qa', 'dev', 'other'], required: true },
    tone: { type: String, enum: TONES, required: true },
    icon: { type: String, required: true },
    permissions: { type: [String], default: [] as PermissionKey[] },
    builtIn: { type: String, enum: ['admin'] },
  },
  { timestamps: true, collection: 'roles' },
)

roleSchema.pre('validate', function () {
  this.nameKey = this.name.trim().toLowerCase()
})

roleSchema.plugin(auditTrailPlugin, { targetType: 'ROLE', title: (d: Record<string, unknown>) => String(d.name) })
roleSchema.plugin(toJSONPlugin)

export const RoleModel = mongoose.model<RoleDoc>('Role', roleSchema)
