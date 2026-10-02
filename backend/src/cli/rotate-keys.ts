import { appModules } from '../app-modules.js'
import { connectDatabase, disconnectDatabase } from '#core/config/db.js'
import { logger } from '#core/config/logger.js'
import { encryption } from '#core/crypto/encryption.js'
import { encryptedPaths } from '#core/database/plugins/field-encryption.js'

// Key rotation: re-encrypts every encrypted field with the current key (ENCRYPTION_CURRENT_KEY_ID).
// Steps: add ENCRYPTION_KEY_V2, set ENCRYPTION_CURRENT_KEY_ID=v2, deploy (new writes use v2, old
// values stay readable), run this, then remove the old key once it reports nothing left.
// Works on raw documents in batches; blind indexes don't change (they hash the plain value).

const BATCH = 500

await connectDatabase()
try {
  for (const model of appModules.flatMap((m) => m.models ?? [])) {
    const paths = encryptedPaths(model.schema)
    if (!paths.length) continue
    const collection = model.collection
    const stale = { $or: paths.map((p) => ({ [p]: { $type: 'string', $not: new RegExp(`^enc:${encryption.currentKeyId}:`) } })) }
    let rotated = 0
    for (;;) {
      const docs = await collection.find(stale).limit(BATCH).toArray()
      const updates = docs.flatMap((doc) => {
        const set: Record<string, string> = {}
        for (const p of paths) {
          const value = doc[p] as unknown
          if (encryption.isEncrypted(value) && encryption.keyIdOf(value) !== encryption.currentKeyId) set[p] = encryption.rotate(value)
          else if (typeof value === 'string' && value && !encryption.isEncrypted(value)) set[p] = encryption.encrypt(value)
        }
        return Object.keys(set).length ? [{ updateOne: { filter: { _id: doc._id }, update: { $set: set } } }] : []
      })
      if (!updates.length) break
      await collection.bulkWrite(updates)
      rotated += updates.length
    }
    logger.info(`[keys] ${collection.collectionName}: ${rotated} document(s) re-encrypted with "${encryption.currentKeyId}"`)
  }
} finally {
  await disconnectDatabase()
}
