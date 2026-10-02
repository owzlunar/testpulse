import type { HydratedDocument, Query, Schema } from 'mongoose'
import { blindIndex } from '../../crypto/blind-index.js'
import { encryption } from '../../crypto/encryption.js'
import '../schema-options.js'

// Encrypts schema fields marked `encrypted: true` at rest (AES-256-GCM) and keeps them plain in memory.
// A field with `blindIndex: '<collection>.<field>'` also gets `<field>_bidx` (private, indexed) so it
// can be looked up by exact value: `{ email_bidx: blindIndex(email, 'users.email') }`; add
// `blindIndexUnique: true` to make the plain value unique (e.g. one account per email).
//
// Covered: doc.save(), findOneAndUpdate / findByIdAndUpdate ($set or plain object).
// Not covered: updateOne / updateMany / bulkWrite / insertMany (they would store plain text):
// use the repository's create / updateById for these models.

interface FieldSpec {
  path: string
  indexContext?: string
}

export const blindIndexPath = (path: string) => `${path}_bidx`

export function fieldEncryptionPlugin(schema: Schema): void {
  const fields: FieldSpec[] = []
  schema.eachPath((path, type) => {
    const options = type.options as { encrypted?: boolean; blindIndex?: string; blindIndexUnique?: boolean }
    if (!options.encrypted) return
    fields.push({ path, indexContext: options.blindIndex })
    if (options.blindIndex) {
      const index = options.blindIndexUnique ? { unique: true, sparse: true } : true
      schema.add({ [blindIndexPath(path)]: { type: String, index, private: true } })
    }
  })
  if (!fields.length) return

  schema.pre('save', function (this: HydratedDocument<unknown>) {
    for (const { path, indexContext } of fields) {
      if (!this.isModified(path)) continue
      const value = this.get(path) as unknown
      if (typeof value !== 'string' || encryption.isEncrypted(value)) continue
      if (indexContext) this.set(blindIndexPath(path), blindIndex(value, indexContext))
      this.set(path, encryption.encrypt(value))
    }
  })

  /** back to plain text in memory, without marking the field changed */
  const decryptInPlace = (doc: HydratedDocument<unknown>) => {
    for (const { path } of fields) {
      const value = doc.get(path) as unknown
      if (!encryption.isEncrypted(value)) continue
      doc.set(path, encryption.decrypt(value))
      doc.unmarkModified(path)
    }
  }
  schema.post('init', decryptInPlace)
  schema.post('save', decryptInPlace)

  schema.pre('findOneAndUpdate', function (this: Query<unknown, unknown>) {
    const update = this.getUpdate() as Record<string, unknown> | null
    if (!update) return
    const target = (update.$set as Record<string, unknown> | undefined) ?? update
    for (const { path, indexContext } of fields) {
      const value = target[path]
      if (typeof value !== 'string' || encryption.isEncrypted(value)) continue
      if (indexContext) target[blindIndexPath(path)] = blindIndex(value, indexContext)
      target[path] = encryption.encrypt(value)
    }
  })
}

/** paths of a schema stored encrypted (audit entries mask their values) */
export const encryptedPaths = (schema: Schema): string[] =>
  Object.entries(schema.paths)
    .filter(([, type]) => (type.options as { encrypted?: boolean }).encrypted)
    .map(([path]) => path)
