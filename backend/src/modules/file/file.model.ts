import mongoose, { Schema } from 'mongoose'
import { stringId } from '#core/database/ids.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

/** what an upload is for: decides who may upload it and who may read it */
export const FILE_CATEGORIES = ['avatar', 'project-logo', 'document-logo', 'case-image'] as const
export type FileCategory = (typeof FILE_CATEGORIES)[number]

export interface FileDoc {
  _id: string
  category: FileCategory
  /** storage key (adapter-relative path) */
  key: string
  name: string
  contentType: string
  size: number
  uploadedBy: string
  createdAt: Date
}

const fileSchema = new Schema<FileDoc>(
  {
    _id: stringId('file'),
    category: { type: String, enum: FILE_CATEGORIES, required: true },
    key: { type: String, required: true, private: true },
    name: { type: String, required: true, maxlength: 255 },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'files' },
)

fileSchema.plugin(toJSONPlugin)

export const FileModel = mongoose.model<FileDoc>('File', fileSchema)
