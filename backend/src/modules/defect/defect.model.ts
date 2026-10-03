import mongoose, { Schema } from 'mongoose'
import type { Defect } from '#contract/types.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

// A defect's id is its number for people (BUG-007), counted across every project.

export interface DefectDoc extends Omit<Defect, 'id' | 'createdAt' | 'updatedAt'> {
  _id: string
  createdAt: Date
  updatedAt: Date
}

const commentSchema = new Schema(
  { by: { type: String, required: true }, at: { type: String, required: true }, text: { type: String, required: true } },
  { _id: false },
)

const defectSchema = new Schema<DefectDoc>(
  {
    _id: { type: String, required: true },
    projectId: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, default: '' },
    stepsToReproduce: { type: String, default: '' },
    expected: { type: String, default: '' },
    actual: { type: String, default: '' },
    severity: { type: String, enum: ['critical', 'major', 'minor', 'trivial'], required: true },
    status: { type: String, enum: ['open', 'in_progress', 'fixed', 'retest', 'closed', 'rejected'], required: true },
    caseId: { type: String },
    caseDeleted: { type: Boolean },
    runId: { type: String },
    stepNumber: { type: Number },
    assignee: { type: String },
    reportedBy: { type: String, required: true },
    externalKey: { type: String },
    environment: { type: String },
    evidence: { type: [String], default: [] },
    comments: { type: [commentSchema], default: [] },
  },
  { collection: 'defects', timestamps: true, versionKey: false },
)

defectSchema.index({ projectId: 1, createdAt: -1 })
defectSchema.index({ projectId: 1, caseId: 1 })
defectSchema.plugin(toJSONPlugin)

export const DefectModel = mongoose.model<DefectDoc>('Defect', defectSchema)

/** the last defect number handed out (one document) */
const counterSchema = new Schema<{ _id: string; seq: number }>(
  { _id: String, seq: { type: Number, default: 0 } },
  { collection: 'defect_counter', versionKey: false },
)
export const DefectCounterModel = mongoose.model('DefectCounter', counterSchema)
