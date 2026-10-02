import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { config } from '../config/env.js'

// AES-256-GCM field encryption with a key ring. Ciphertext: "enc:<keyId>:<iv>:<tag>:<data>" (hex),
// so a value says which key encrypted it: after a rotation old values stay readable while new
// writes use the current key (src/cli/rotate-keys.ts re-encrypts the rest).

const ALGORITHM = 'aes-256-gcm'
const PREFIX = 'enc'

export class KeyRing {
  private readonly keys = new Map<string, Buffer>()

  constructor(
    keys: Record<string, string>,
    public currentKeyId: string,
  ) {
    for (const [id, hex] of Object.entries(keys)) this.keys.set(id.toLowerCase(), Buffer.from(hex, 'hex'))
    if (!this.keys.has(currentKeyId)) throw new Error(`Encryption key "${currentKeyId}" is not in the key ring`)
  }

  isEncrypted(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(`${PREFIX}:`) && value.split(':').length === 5
  }

  keyIdOf(value: string): string | null {
    return this.isEncrypted(value) ? (value.split(':')[1] ?? null) : null
  }

  encrypt(plain: string, keyId = this.currentKeyId): string {
    const key = this.keys.get(keyId)
    if (!key) throw new Error(`Encryption key "${keyId}" is not in the key ring`)
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    return [PREFIX, keyId, iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':')
  }

  /** plain values pass through unchanged (e.g. data written before a field was encrypted) */
  decrypt(value: string): string {
    if (!this.isEncrypted(value)) return value
    const [, keyId, iv, tag, data] = value.split(':') as [string, string, string, string, string]
    const key = this.keys.get(keyId)
    if (!key) throw new Error(`Cannot decrypt: key "${keyId}" is not in the key ring`)
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
    decipher.setAuthTag(Buffer.from(tag, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
  }

  /** re-encrypts with the current key; already current values are returned as they are */
  rotate(value: string): string {
    return this.keyIdOf(value) === this.currentKeyId ? value : this.encrypt(this.decrypt(value))
  }
}

export const encryption = new KeyRing(config.encryption.keys, config.encryption.currentKeyId)
