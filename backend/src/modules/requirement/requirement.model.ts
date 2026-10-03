import mongoose, { Schema } from 'mongoose'
import type { Requirement } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

export interface RequirementDoc extends Omit<Requirement, 'id' | 'createdAt' | 'updatedAt'> {
  _id: string
  createdAt: Date
  updatedAt: Date
}

const requirementSchema = new Schema<RequirementDoc>(
  {
    _id: stringId('req'),
    projectId: { type: String, required: true },
    code: { type: String, required: true, trim: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 5000 },
    type: { type: String, enum: ['functional', 'non_functional', 'business_rule'], required: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    status: { type: String, enum: ['draft', 'approved', 'changed', 'deprecated'], required: true },
    source: { type: String, maxlength: 300 },
    acceptanceCriteria: { type: [String], default: [] },
  },
  { collection: 'requirements', timestamps: true, versionKey: false },
)

requirementSchema.index({ projectId: 1, code: 1 }, { unique: true })
requirementSchema.plugin(toJSONPlugin)

export const RequirementModel = mongoose.model<RequirementDoc>('Requirement', requirementSchema)
