import type { HydratedDocument, Model, Query, Schema } from 'mongoose'
import type { AuditChange, AuditTargetType } from '#contract/types.js'
import { recordAudit } from '../../audit/audit-sink.js'
import { encryption } from '../../crypto/encryption.js'
import { encryptedPaths } from './field-encryption.js'

// Records CREATE / UPDATE / DELETE of a model to the audit sink, with the fields that changed.
// Install it after fieldEncryptionPlugin. Encrypted fields show as changed but never with their values.
//
// Covered: doc.save(), findOneAndUpdate / findByIdAndUpdate, findOneAndDelete / findByIdAndDelete,
// doc.deleteOne(). Not covered: updateMany / deleteMany / bulkWrite / insertMany: record those
// yourself with recordAudit() (e.g. one entry per changed document).

export interface AuditTrailOptions {
  /** e.g. 'PROJECT' */
  targetType: AuditTargetType
  /** what the entry calls the document, e.g. the project name */
  title: (doc: Record<string, unknown>) => string
  /** for documents that belong to a project */
  projectId?: (doc: Record<string, unknown>) => string | undefined
  /** fields that never count as a change */
  ignore?: string[]
}

const ALWAYS_IGNORED = ['_id', '__v', 'createdAt', 'updatedAt']
const MASK = '********'

type Plain = Record<string, unknown>

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function auditTrailPlugin(schema: Schema, options: AuditTrailOptions): void {
  const secret = new Set(encryptedPaths(schema))
  const ignored = new Set([
    ...ALWAYS_IGNORED,
    ...(options.ignore ?? []),
    // private fields (hashes, blind indexes) are not part of the record
    ...Object.entries(schema.paths)
      .filter(([, type]) => (type.options as { private?: boolean }).private)
      .map(([path]) => path),
  ])

  const plain = (value: unknown) => (encryption.isEncrypted(value) ? encryption.decrypt(value) : value)

  function diff(before: Plain, after: Plain): AuditChange[] {
    const changes: AuditChange[] = []
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (ignored.has(field) || field.endsWith('_bidx')) continue
      const oldValue = plain(before[field])
      const newValue = plain(after[field])
      if (same(oldValue, newValue)) continue
      changes.push(secret.has(field) ? { field, oldValue: MASK, newValue: MASK } : { field, oldValue, newValue })
    }
    return changes
  }

  const target = (doc: Plain) => ({
    targetType: options.targetType,
    targetId: String(doc._id),
    targetTitle: options.title(doc),
    projectId: options.projectId?.(doc),
  })

  // --- doc.save() ---------------------------------------------------------------------------------
  schema.pre('save', async function (this: HydratedDocument<unknown> & { $locals: Plain }) {
    this.$locals.auditBefore = this.isNew ? null : await (this.constructor as Model<unknown>).findById(this._id).lean()
  })
  schema.post('save', async function (this: HydratedDocument<unknown> & { $locals: Plain }) {
    const after = this.toObject({ depopulate: true, transform: false }) as Plain
    const before = this.$locals.auditBefore as Plain | null
    if (!before) return recordAudit({ action: 'CREATE', ...target(after) })
    const changes = diff(before, after)
    if (changes.length) await recordAudit({ action: 'UPDATE', ...target(after), changes })
  })

  // --- findOneAndUpdate ---------------------------------------------------------------------------
  type AuditedQuery = Query<unknown, unknown> & { auditBefore?: Plain | null }
  schema.pre('findOneAndUpdate', async function (this: AuditedQuery) {
    this.auditBefore = (await this.model.findOne(this.getFilter()).lean()) as Plain | null
  })
  schema.post('findOneAndUpdate', async function (this: AuditedQuery, result: unknown) {
    const before = this.auditBefore
    if (!before) return
    const afterDoc = this.getOptions().new || this.getOptions().returnDocument === 'after' ? result : await this.model.findById(before._id)
    if (!afterDoc) return
    const after = (afterDoc as HydratedDocument<unknown>).toObject?.({ transform: false }) ?? (afterDoc as Plain)
    const changes = diff(before, after as Plain)
    if (changes.length) await recordAudit({ action: 'UPDATE', ...target(after as Plain), changes })
  })

  // --- deletes ------------------------------------------------------------------------------------
  schema.post('findOneAndDelete', async function (result: unknown) {
    if (!result) return
    const doc = (result as HydratedDocument<unknown>).toObject?.({ transform: false }) ?? (result as Plain)
    await recordAudit({ action: 'DELETE', ...target(doc as Plain) })
  })
  schema.post('deleteOne', { document: true, query: false }, async function (this: HydratedDocument<unknown>) {
    await recordAudit({ action: 'DELETE', ...target(this.toObject({ transform: false }) as Plain) })
  })
}
