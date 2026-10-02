import dotenvFlow from 'dotenv-flow'
import Joi from 'joi'

// Environment, validated once at start-up. A missing or weak secret stops the process (fail-fast):
// there are no built-in fallback keys, salts or passwords anywhere in the code.

// tests set their own environment (tests/setup-env.ts) and never read a developer's .env
if (process.env.NODE_ENV !== 'test') dotenvFlow.config({ silent: true })

const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/
/** example values from env-example: allowed in development and tests, refused in production */
const EXAMPLE_SECRETS = new Set([
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
])

const normalizeBasePath = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(4000),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
  /** every API route is mounted under it (the health probes are also served at the root) */
  BASE_PATH: Joi.string().allow('').default('/api/v1'),
  /** where the web app runs; invite links point at it */
  APP_URL: Joi.string().uri().required(),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  MAX_PAGE_SIZE: Joi.number().integer().min(1).default(100),
  /** 0 keeps audit entries forever */
  AUDIT_RETENTION_DAYS: Joi.number().integer().min(0).default(0),
  CRON_TIMEZONE: Joi.string().default('Asia/Bangkok'),

  JWT_PRIVATE_KEY: Joi.string().required(),
  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_ISSUER: Joi.string().default('testpulse'),
  JWT_AUDIENCE: Joi.string().default('testpulse-web'),
  ACCESS_TOKEN_TTL_SEC: Joi.number()
    .integer()
    .min(60)
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(14),
  INVITE_TTL_HOURS: Joi.number().integer().min(1).default(72),
  /** the refresh cookie is sent over HTTPS only (default: on in production) */
  COOKIE_SECURE: Joi.boolean(),

  ENCRYPTION_CURRENT_KEY_ID: Joi.string()
    .pattern(/^[a-z0-9]+$/i)
    .required(),
  BLIND_INDEX_SALT: Joi.string().pattern(HEX_32_BYTES).required(),

  STORAGE_DRIVER: Joi.string().valid('local', 'minio').default('local'),
  STORAGE_LOCAL_ROOT: Joi.string().default('storage/uploads'),
  MINIO_ENDPOINT: Joi.string().when('STORAGE_DRIVER', { is: 'minio', then: Joi.required(), otherwise: Joi.optional() }),
  MINIO_PORT: Joi.number().port().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().when('STORAGE_DRIVER', { is: 'minio', then: Joi.required(), otherwise: Joi.optional() }),
  MINIO_SECRET_KEY: Joi.string().when('STORAGE_DRIVER', { is: 'minio', then: Joi.required(), otherwise: Joi.optional() }),
  MINIO_BUCKET: Joi.string().default('testpulse'),
  UPLOAD_MAX_BYTES: Joi.number()
    .integer()
    .min(1)
    .default(2 * 1024 * 1024),

  /** smtp: send for real · log: write the mail (with its links) to the log, for development without a mail server */
  MAIL_DRIVER: Joi.string().valid('smtp', 'log').default('log'),
  MAIL_FROM: Joi.string().default('TestPulse <no-reply@testpulse.local>'),
  SMTP_HOST: Joi.string().when('MAIL_DRIVER', { is: 'smtp', then: Joi.required(), otherwise: Joi.optional() }),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASSWORD: Joi.string().allow('').optional(),

  CORS_ORIGINS: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.alternatives().try(Joi.boolean(), Joi.number(), Joi.string()).default(1),
  BODY_LIMIT: Joi.string().default('1mb'),
  /** requests per user (or IP) per 15 minutes, whole API */
  RATE_LIMIT_GLOBAL: Joi.number().integer().min(1).default(1000),
  /** sign-in / register / refresh / invite requests per IP per minute */
  RATE_LIMIT_AUTH: Joi.number().integer().min(1).default(20),
}).unknown(true)

// a key left empty in .env (e.g. `SMTP_HOST=`) counts as not set
const defined = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''))
const { error, value: env } = schema.validate(defined, { abortEarly: false, convert: true })
if (error) {
  throw new Error(`Invalid environment:\n  - ${error.details.map((d) => d.message).join('\n  - ')}`)
}

const currentKeyId = String(env.ENCRYPTION_CURRENT_KEY_ID).toLowerCase()
/** every ENCRYPTION_KEY_<ID> variable: old keys stay readable after a rotation */
const encryptionKeys: Record<string, string> = {}
for (const [name, value] of Object.entries(process.env)) {
  const match = /^ENCRYPTION_KEY_([A-Z0-9]+)$/i.exec(name)
  if (!match?.[1] || !value) continue
  if (!HEX_32_BYTES.test(value)) throw new Error(`Invalid environment: ${name} must be a 64-character hex string`)
  encryptionKeys[match[1].toLowerCase()] = value
}
if (!encryptionKeys[currentKeyId]) {
  throw new Error(`Invalid environment: ENCRYPTION_KEY_${currentKeyId.toUpperCase()} (the current key) is not set`)
}

const pem = (value: string) => value.replace(/\\n/g, '\n')
const isProduction = env.NODE_ENV === 'production'

if (isProduction) {
  if (EXAMPLE_SECRETS.has(encryptionKeys[currentKeyId]!) || EXAMPLE_SECRETS.has(env.BLIND_INDEX_SALT)) {
    throw new Error('Refusing to start in production with the example encryption key or blind index salt')
  }
  if (env.MAIL_DRIVER !== 'smtp') throw new Error('Refusing to start in production without MAIL_DRIVER=smtp (invites would never arrive)')
}

export const config = Object.freeze({
  env: env.NODE_ENV as 'development' | 'production' | 'test',
  isProduction,
  isTest: env.NODE_ENV === 'test',
  port: env.PORT as number,
  logLevel: env.LOG_LEVEL as string,
  basePath: normalizeBasePath(env.BASE_PATH),
  appUrl: String(env.APP_URL).replace(/\/+$/, ''),
  mongo: { uri: env.MONGODB_URI as string },
  pagination: { maxPageSize: env.MAX_PAGE_SIZE as number },
  audit: { retentionDays: env.AUDIT_RETENTION_DAYS as number },
  cron: { timezone: env.CRON_TIMEZONE as string },
  auth: {
    privateKey: pem(env.JWT_PRIVATE_KEY),
    publicKey: pem(env.JWT_PUBLIC_KEY),
    issuer: env.JWT_ISSUER as string,
    audience: env.JWT_AUDIENCE as string,
    accessTokenTtlSec: env.ACCESS_TOKEN_TTL_SEC as number,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS as number,
    inviteTtlHours: env.INVITE_TTL_HOURS as number,
    cookieSecure: (env.COOKIE_SECURE ?? isProduction) as boolean,
  },
  encryption: { currentKeyId, keys: encryptionKeys },
  blindIndex: { salt: env.BLIND_INDEX_SALT as string },
  storage: {
    driver: env.STORAGE_DRIVER as 'local' | 'minio',
    localRoot: env.STORAGE_LOCAL_ROOT as string,
    maxUploadBytes: env.UPLOAD_MAX_BYTES as number,
  },
  minio: {
    endPoint: env.MINIO_ENDPOINT as string,
    port: env.MINIO_PORT as number,
    useSSL: env.MINIO_USE_SSL as boolean,
    accessKey: env.MINIO_ACCESS_KEY as string,
    secretKey: env.MINIO_SECRET_KEY as string,
    bucket: env.MINIO_BUCKET as string,
  },
  mail: {
    driver: env.MAIL_DRIVER as 'smtp' | 'log',
    from: env.MAIL_FROM as string,
    smtp: {
      host: env.SMTP_HOST as string,
      port: env.SMTP_PORT as number,
      secure: env.SMTP_SECURE as boolean,
      user: (env.SMTP_USER as string) || undefined,
      password: (env.SMTP_PASSWORD as string) || undefined,
    },
  },
  cors: {
    origins: String(env.CORS_ORIGINS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  trustProxy: env.TRUST_PROXY as boolean | number | string,
  bodyLimit: env.BODY_LIMIT as string,
  rateLimit: { global: env.RATE_LIMIT_GLOBAL as number, auth: env.RATE_LIMIT_AUTH as number },
})

export type Config = typeof config
