import { generateKeyPairSync, randomBytes } from 'node:crypto'

// Environment for tests, set before any src module reads it. Secrets are made per run, never committed.
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://127.0.0.1:1/placeholder', // the real one comes from the test database helper
  JWT_PRIVATE_KEY: privateKey,
  JWT_PUBLIC_KEY: publicKey,
  ENCRYPTION_CURRENT_KEY_ID: 'v1',
  ENCRYPTION_KEY_V1: randomBytes(32).toString('hex'),
  BLIND_INDEX_SALT: randomBytes(32).toString('hex'),
  MAIL_DRIVER: 'log',
  STORAGE_DRIVER: 'local',
  // the limits themselves are tested with their own limiter (core/http/__tests__)
  RATE_LIMIT_GLOBAL: '100000',
  RATE_LIMIT_AUTH: '100000',
})
