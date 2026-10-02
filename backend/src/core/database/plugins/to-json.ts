import type { Schema } from 'mongoose'

// API shape of a document: `_id` -> `id`, no `__v`, no field marked `private: true` in the schema
// (password hashes, blind indexes). Encrypted fields are already plain in memory (field-encryption).

const privatePaths = (schema: Schema) =>
  Object.entries(schema.paths)
    .filter(([, type]) => (type.options as { private?: boolean }).private)
    .map(([path]) => path)

export function toJSONPlugin(schema: Schema): void {
  const hidden = privatePaths(schema)
  const transform = (_doc: unknown, ret: Record<string, unknown>) => {
    if (ret._id !== undefined) {
      ret.id = String(ret._id)
      delete ret._id
    }
    delete ret.__v
    for (const path of hidden) delete ret[path]
    return ret
  }
  schema.set('toJSON', { virtuals: false, versionKey: false, transform })
}
