import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { blindIndex } from '../blind-index.js'
import { KeyRing } from '../encryption.js'

const key = () => randomBytes(32).toString('hex')

describe('key ring', () => {
  it('reads old values after a rotation and re-encrypts them with the current key', () => {
    const v1 = key()
    const old = new KeyRing({ v1 }, 'v1')
    const stored = old.encrypt('somchai@testpulse.dev')

    const rotated = new KeyRing({ v1, v2: key() }, 'v2')
    expect(rotated.decrypt(stored)).toBe('somchai@testpulse.dev')
    const again = rotated.rotate(stored)
    expect(rotated.keyIdOf(again)).toBe('v2')
    expect(rotated.decrypt(again)).toBe('somchai@testpulse.dev')
    expect(rotated.rotate(again)).toBe(again)
  })

  it('detects tampering and refuses unknown keys', () => {
    const ring = new KeyRing({ v1: key() }, 'v1')
    const value = ring.encrypt('secret')
    const tampered = value.slice(0, -2) + (value.endsWith('00') ? '11' : '00')
    expect(() => ring.decrypt(tampered)).toThrow()
    expect(() => new KeyRing({ v1: key() }, 'v9')).toThrow(/not in the key ring/)
    expect(ring.decrypt('plain text')).toBe('plain text')
  })
})

describe('blind index', () => {
  it('is stable for the same value, differs per field, and ignores case and spaces', () => {
    expect(blindIndex(' A@x.dev ', 'users.email')).toBe(blindIndex('a@x.dev', 'users.email'))
    expect(blindIndex('a@x.dev', 'users.email')).not.toBe(blindIndex('a@x.dev', 'other.field'))
    expect(blindIndex('', 'users.email')).toBeNull()
    expect(blindIndex(null, 'users.email')).toBeNull()
  })
})
