import mongoose, { Schema } from 'mongoose'
import type { TestRun } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

// A round of execution. Its results are snapshots of the cases at the time the run was made (name,
// version, steps), each with what the tester recorded; they live inside the run and are written one
// at a time (PUT …/results/:caseId).

export interface RunDoc extends Omit<TestRun, 'id' | 'createdAt'> {
  _id: string
  createdAt: Date
}

const runSchema = new Schema<RunDoc>(
  {
    _id: stringId('run'),
    projectId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: ['smoke', 'functional', 'regression', 'uat'], required: true },
    round: { type: Number, required: true, min: 1 },
    environment: { type: String, default: '' },
    build: { type: String, default: '' },
    status: { type: String, enum: ['planned', 'in_progress', 'completed'], default: 'planned' },
    plannedStart: { type: String, default: '' },
    plannedEnd: { type: String, default: '' },
    startedAt: { type: String },
    completedAt: { type: String },
    createdBy: { type: String, required: true },
    results: { type: Schema.Types.Mixed, default: () => [] },
  },
  { collection: 'test_runs', timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
)

runSchema.index({ projectId: 1, createdAt: -1 })
runSchema.index({ projectId: 1, 'results.caseId': 1 })

runSchema.plugin(toJSONPlugin)

export const RunModel = mongoose.model<RunDoc>('TestRun', runSchema)
