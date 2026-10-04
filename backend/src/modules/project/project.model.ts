import mongoose, { Schema } from 'mongoose'
import { ENVIRONMENT_NAME_MAX, PROJECT_KEY_MAX } from '#contract/rules/project.js'
import type { Project } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { auditTrailPlugin } from '#core/database/plugins/audit-trail.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

export interface ProjectDoc extends Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'caseStats'> {
  _id: string
  createdAt: Date
  updatedAt: Date
}

const milestoneSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, maxlength: 200 },
    date: { type: String, required: true },
    type: { type: String, enum: ['code_freeze', 'uat_signoff', 'go_live'], required: true },
    description: { type: String, maxlength: 1000 },
  },
  { _id: false },
)

const environmentSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: ENVIRONMENT_NAME_MAX },
    primary: { type: Boolean, default: false },
    teamId: { type: String },
  },
  { _id: false },
)

const projectSchema = new Schema<ProjectDoc>(
  {
    _id: stringId('proj'),
    key: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: PROJECT_KEY_MAX },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    logo: { type: String },
    targetDeadline: { type: String },
    status: { type: String, enum: ['active', 'in_review', 'completed', 'archived'], default: 'active' },
    tags: { type: [String], default: [] },
    milestones: { type: [milestoneSchema], default: [] },
    teamIds: { type: [String], default: [], index: true },
    // no default: projects made before environments read as none until the migration gives them TEST (the service sets them)
    environments: { type: [environmentSchema] },
  },
  { timestamps: true, collection: 'projects' },
)

projectSchema.plugin(auditTrailPlugin, {
  targetType: 'PROJECT',
  title: (d: Record<string, unknown>) => String(d.name),
  projectId: (d: Record<string, unknown>) => String(d._id),
})
projectSchema.plugin(toJSONPlugin)

export const ProjectModel = mongoose.model<ProjectDoc>('Project', projectSchema)
