import mongoose, { Schema } from 'mongoose'
import type { TestCase } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'

// A case's `id` (TC-101, sub-case TC-101-1) restarts per project and changes when the list is
// renumbered; its `uid` never changes, so it is the document's _id. `position` is the manual order
// of the project's list (drag and drop): kept here, never sent.

export interface TestCaseDoc extends Omit<TestCase, 'uid' | 'rev' | 'createdAt' | 'updatedAt'> {
  _id: string
  rev: number
  position: number
  createdAt: Date
  updatedAt: Date
}

const stepSchema = new Schema(
  {
    id: { type: String, required: true },
    stepNumber: { type: Number, required: true },
    action: { type: String, default: '' },
    testData: { type: String, default: '' },
    expectedResult: { type: String, default: '' },
  },
  { _id: false },
)

const STATUSES = ['pending', 'ready_for_test', 'untested', 'in_progress', 'passed', 'failed', 'blocked']
const PRIORITIES = ['critical', 'high', 'medium', 'low']

const testCaseSchema = new Schema<TestCaseDoc>(
  {
    _id: stringId('tc'),
    id: { type: String, required: true },
    projectId: { type: String, required: true },
    numericId: { type: Number, required: true },
    parentId: { type: String, default: null },
    position: { type: Number, required: true },
    rev: { type: Number, default: 1 },
    requirement: { type: String, default: '' },
    requirementIds: { type: [String], default: [] },
    testScenario: { type: String, default: '' },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    prerequisite: { type: String, default: '' },
    steps: { type: [stepSchema], default: [] },
    expectedResults: { type: String, default: '' },
    expectedImages: { type: [String], default: [] },
    actualResults: { type: String, default: '' },
    actualImages: { type: [String], default: [] },
    status: { type: String, enum: STATUSES, required: true },
    priority: { type: String, enum: PRIORITIES, required: true },
    expiryDate: { type: String, default: '' },
    assignedTo: { type: String },
    assignedDev: { type: String },
    rootCauseTag: { type: String },
    churnCount: { type: Number },
    executedBy: { type: String },
    executedAt: { type: String },
    version: { type: String, required: true },
    // records with spec snapshots, review flags and presence are written whole by the service
    versionHistory: { type: [Schema.Types.Mixed], default: [] },
    reviewNeeded: { type: Schema.Types.Mixed },
    archivedAt: { type: String },
    archivedBy: { type: String },
    activeUser: { type: Schema.Types.Mixed },
  },
  // `id` is a field of its own here (the case number), not Mongoose's alias of _id
  { collection: 'test_cases', timestamps: true, versionKey: false, id: false, minimize: false },
)

testCaseSchema.index({ projectId: 1, id: 1 }, { unique: true })
testCaseSchema.index({ projectId: 1, position: 1 })
testCaseSchema.index({ requirementIds: 1 })

/** the API shape: _id is the uid, no position, dates as ISO strings */
const toApi = (_doc: unknown, ret: Record<string, unknown>) => {
  ret.uid = ret._id
  delete ret._id
  delete ret.position
  for (const key of ['createdAt', 'updatedAt'] as const) if (ret[key] instanceof Date) ret[key] = (ret[key] as Date).toISOString()
  if (ret.reviewNeeded == null) delete ret.reviewNeeded
  return ret
}
testCaseSchema.set('toJSON', { versionKey: false, transform: toApi as never })

export const TestCaseModel = mongoose.model<TestCaseDoc>('TestCase', testCaseSchema)
