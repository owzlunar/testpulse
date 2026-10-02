import mongoose, { Schema } from 'mongoose'
import type { Team } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { auditTrailPlugin } from '#core/database/plugins/audit-trail.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

export interface TeamDoc extends Omit<Team, 'id' | 'createdAt' | 'updatedAt'> {
  _id: string
  nameKey: string
  createdAt: Date
  updatedAt: Date
}

const teamSchema = new Schema<TeamDoc>(
  {
    _id: stringId('team'),
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameKey: { type: String, required: true, unique: true, private: true },
    description: { type: String, default: '', maxlength: 500 },
    tone: { type: String, enum: ['primary', 'secondary', 'info', 'success', 'warning', 'caution', 'error'], required: true },
    memberIds: { type: [String], default: [], index: true },
  },
  { timestamps: true, collection: 'teams' },
)

teamSchema.pre('validate', function () {
  this.nameKey = this.name.trim().toLowerCase()
})

teamSchema.plugin(auditTrailPlugin, { targetType: 'TEAM', title: (d: Record<string, unknown>) => String(d.name) })
teamSchema.plugin(toJSONPlugin)

export const TeamModel = mongoose.model<TeamDoc>('Team', teamSchema)
