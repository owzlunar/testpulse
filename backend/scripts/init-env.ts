import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// npm run env:init -- dev    -> .env.dev   (development)
// npm run env:init -- prod   -> .env.prod  (the container, via docker-compose's env_file)
// Copies env-example with fresh secrets (JWT keypair, encryption key v1 and ENCRYPTION_CURRENT_KEY_ID=v1,
// blind index salt): the file is complete on its own (a server with only the image has no backend/.env).
// Never overwrites an existing file: secrets in use must not change (stored data would become
// unreadable). Shared defaults stay in .env.

const FILES: Record<string, string> = { dev: '.env.dev', prod: '.env.prod' }
const which = process.argv[2] ?? ''
const file = FILES[which]
if (!file) {
  console.error('usage: npm run env:init -- dev | prod')
  process.exit(2)
}

const root = resolve(import.meta.dirname, '..')
const target = resolve(root, file)
if (existsSync(target)) {
  console.log(`${file} already exists, left as it is`)
  process.exit(0)
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const oneLine = (pem: string) => `"${pem.trim().replace(/\n/g, '\\n')}"`
const values: Record<string, string> = {
  JWT_PRIVATE_KEY: oneLine(privateKey),
  JWT_PUBLIC_KEY: oneLine(publicKey),
  ENCRYPTION_KEY_V1: randomBytes(32).toString('hex'),
  ENCRYPTION_CURRENT_KEY_ID: 'v1',
  BLIND_INDEX_SALT: randomBytes(32).toString('hex'),
  // shared with the backup agent's backup.env when it is turned on (BACKUP_AGENT_URL)
  BACKUP_AGENT_TOKEN: randomBytes(32).toString('hex'),
  // the container's starting points (see docker-compose.yml)
  ...(which === 'prod'
    ? {
        BASE_URL: 'http://localhost:8080',
        MONGODB_URI: 'mongodb://user:pass@host.docker.internal:27017/testpulse?authSource=admin&replicaSet=rs0&directConnection=true',
        MAIL_DRIVER: 'smtp',
        SMTP_HOST: 'host.docker.internal',
      }
    : {}),
}

const header = `# ${which === 'dev' ? 'Development (NODE_ENV=development, the default)' : 'Production: the container (docker-compose env_file)'}. Overrides .env; not in git.\n`
const content = readFileSync(resolve(root, 'env-example'), 'utf8')
  .split('\n')
  .filter((line) => !line.startsWith('#') && !(which === 'prod' && line.startsWith('PORT=')))
  .join('\n')
  .replace(/^([A-Z0-9_]+)=.*$/gm, (line, key: string) => (key in values ? `${key}=${values[key]}` : line))
  .replace(/\n{3,}/g, '\n\n')
writeFileSync(target, header + content.trimStart(), { mode: 0o600 })
console.log(`${file} created with new secrets: set MONGODB_URI${which === 'prod' ? ', the storage and SMTP settings' : ''}`)
