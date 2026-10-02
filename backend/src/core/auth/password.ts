import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// scrypt (built into Node, memory-hard). Stored as "scrypt$N$r$p$salt$hash" so the cost can be
// raised later without breaking existing hashes.

const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEY_LENGTH = 64
export const PASSWORD_MIN_LENGTH = 8

const derive = (password: string, salt: Buffer, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  )

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await derive(password, salt, COST)
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored?.split('$') ?? []
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p), maxmem: COST.maxmem })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** a real hash of nothing: verifying against it costs the same time as a real account (no user enumeration) */
let dummyHash: Promise<string> | null = null
export const timingDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString('hex')))
