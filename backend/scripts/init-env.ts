import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Creates .env from env-example with fresh secrets (JWT keypair, encryption key, blind index salt).
// Never overwrites an existing .env: secrets in use must not change (data would become unreadable).

const root = resolve(import.meta.dirname, '..')
const target = resolve(root, '.env')
if (existsSync(target)) {
  console.log('.env already exists, left as it is')
  process.exit(0)
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const oneLine = (pem: string) => `"${pem.trim().replace(/\n/g, '\\n')}"`
const secrets: Record<string, string> = {
  JWT_PRIVATE_KEY: oneLine(privateKey),
  JWT_PUBLIC_KEY: oneLine(publicKey),
  ENCRYPTION_KEY_V1: randomBytes(32).toString('hex'),
  BLIND_INDEX_SALT: randomBytes(32).toString('hex'),
}

const content = readFileSync(resolve(root, 'env-example'), 'utf8').replace(/^([A-Z0-9_]+)=.*$/gm, (line, key: string) =>
  key in secrets ? `${key}=${secrets[key]}` : line,
)
writeFileSync(target, content, { mode: 0o600 })
console.log('.env created with new secrets; set MONGODB_URI and the storage / mail settings')
