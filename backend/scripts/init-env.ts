import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Creates .env from env-example with fresh secrets (JWT keypair, encryption key, blind index salt).
// Never overwrites an existing .env: secrets in use must not change (data would become unreadable).

const root = resolve(import.meta.dirname, '..')
// `--secrets-only <file>`: just the secrets, e.g. for docker-compose's env_file (../docker/secrets.env)
const secretsOnly = process.argv.indexOf('--secrets-only')
const target = secretsOnly >= 0 ? resolve(process.cwd(), process.argv[secretsOnly + 1] ?? '') : resolve(root, '.env')
if (secretsOnly >= 0 && !process.argv[secretsOnly + 1]) {
  console.error('usage: npm run env:init -- --secrets-only <file>')
  process.exit(2)
}
if (existsSync(target)) {
  console.log(`${target} already exists, left as it is`)
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

if (secretsOnly >= 0) {
  const lines = [
    '# TestPulse secrets: keep them; changing ENCRYPTION_KEY_* or BLIND_INDEX_SALT makes stored data unreadable',
    'ENCRYPTION_CURRENT_KEY_ID=v1',
  ]
  // logins of the services the deployment uses, filled in by hand
  const logins = [
    '# connections and logins, as needed',
    'MONGODB_URI=',
    'MINIO_ACCESS_KEY=',
    'MINIO_SECRET_KEY=',
    'SMTP_USER=',
    'SMTP_PASSWORD=',
    '# first start on an empty database (remove after the first sign-in)',
    'INITIAL_ADMIN_PASSWORD=',
  ]
  writeFileSync(target, [...lines, ...Object.entries(secrets).map(([k, v]) => `${k}=${v}`), ...logins, ''].join('\n'), { mode: 0o600 })
  console.log(`${target} created with new secrets (add the MinIO / SMTP logins it needs)`)
  process.exit(0)
}

const content = readFileSync(resolve(root, 'env-example'), 'utf8').replace(/^([A-Z0-9_]+)=.*$/gm, (line, key: string) =>
  key in secrets ? `${key}=${secrets[key]}` : line,
)
writeFileSync(target, content, { mode: 0o600 })
console.log('.env created with new secrets; set MONGODB_URI and the storage / mail settings')
