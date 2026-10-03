import mongoose, { Schema } from 'mongoose'
import type { DocumentRecord, DocumentTemplate } from '#contract/types.js'
import { stringId } from '#core/database/ids.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

// A generated document: what was asked for (type, options, UAT details, signatories) and the data it
// prints, frozen in `snapshot` when it was made (a new version takes fresh data and resets signatures).

export interface DocumentDoc extends Omit<DocumentRecord, 'id' | 'createdAt' | 'updatedAt'> {
  _id: string
  createdAt: Date
  updatedAt: Date
}

const signatorySchema = new Schema(
  {
    role: { type: String, default: '' },
    name: { type: String, default: '' },
    position: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'signed', 'rejected'], default: 'pending' },
    signedAt: { type: String },
    comment: { type: String },
  },
  { _id: false },
)

const documentSchema = new Schema<DocumentDoc>(
  {
    _id: stringId('doc'),
    projectId: { type: String, required: true },
    type: { type: String, enum: ['test_spec', 'test_summary', 'uat', 'rtm'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    docNumber: { type: String, required: true, trim: true, maxlength: 80 },
    version: { type: Number, default: 1 },
    status: { type: String, enum: ['draft', 'pending_signoff', 'signed', 'rejected'], default: 'draft' },
    options: { type: Schema.Types.Mixed, required: true },
    uat: { type: Schema.Types.Mixed },
    signatories: { type: [signatorySchema], default: [] },
    snapshot: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, required: true },
  },
  { collection: 'documents', timestamps: true, versionKey: false, minimize: false },
)

documentSchema.index({ projectId: 1, updatedAt: -1 })
documentSchema.plugin(toJSONPlugin)

export const DocumentModel = mongoose.model<DocumentDoc>('Document', documentSchema)

/** the organisation's branding and defaults for every document (one record) */
export interface DocumentTemplateDoc extends DocumentTemplate {
  _id: string
}

const templateSchema = new Schema<DocumentTemplateDoc>(
  {
    _id: { type: String, required: true },
    companyName: String,
    companyAddress: String,
    logo: String,
    docNumberPattern: String,
    headerNote: String,
    footerNote: String,
    defaultSignatories: { type: [{ role: String, position: String, _id: false }], default: undefined },
  },
  { collection: 'document_template', timestamps: true, versionKey: false },
)

export const DocumentTemplateModel = mongoose.model<DocumentTemplateDoc>('DocumentTemplate', templateSchema)
