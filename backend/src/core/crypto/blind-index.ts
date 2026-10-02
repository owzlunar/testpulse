import { createHmac, hkdfSync } from 'node:crypto'
import { config } from '../config/env.js'

// Blind index: HMAC-SHA256 of the normalized plain value, so an encrypted field can still be found by
// exact match (e.g. sign-in by email). Each field gets its own key (HKDF with the field name as
// context), so equal values in different fields don't produce equal hashes.

const fieldKeys = new Map<string, Buffer>()

function fieldKey(context: string): Buffer {
  let key = fieldKeys.get(context)
  if (!key) {
    key = Buffer.from(hkdfSync('sha256', Buffer.from(config.blindIndex.salt, 'hex'), Buffer.alloc(0), Buffer.from(context, 'utf8'), 32))
    fieldKeys.set(context, key)
  }
  return key
}

export const normalizeForIndex = (value: string) => value.normalize('NFKC').trim().toLowerCase()

/** `context` names the field, e.g. "users.email" */
export function blindIndex(value: string | null | undefined, context: string): string | null {
  if (value == null) return null
  const normalized = normalizeForIndex(value)
  return normalized ? createHmac('sha256', fieldKey(context)).update(normalized).digest('hex') : null
}
