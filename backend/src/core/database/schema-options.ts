import type { HydratedDocument } from 'mongoose'

// Schema field options read by the core plugins.
declare module 'mongoose' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  interface SchemaTypeOptions<T, EnforcedDocType = any, THydratedDocumentType = HydratedDocument<EnforcedDocType>> {
    /** never in API output (toJSON) nor in audit entries: password hashes, token hashes */
    private?: boolean
    /** stored with AES-256-GCM, plain in memory (field-encryption plugin) */
    encrypted?: boolean
    /** with `encrypted`: also keep `<field>_bidx` for exact-match lookup; the value names the field, e.g. 'users.email' */
    blindIndex?: string
  }
}
