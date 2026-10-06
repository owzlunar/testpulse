import dotenvFlow from 'dotenv-flow'
import Joi from 'joi'

// Environment, validated once at start-up. A missing or weak secret stops the process (fail-fast):
// there are no built-in fallback keys, salts or passwords anywhere in the code.

// Settings files (backend/), later ones override earlier ones; variables already set in the
// environment (shell, docker-compose) override every file:
//   .env                       shared defaults, no secrets (in git)
//   .env.dev                   NODE_ENV=development (the default): local development
//   .env.prod                  NODE_ENV=production: the container (docker-compose passes it as env_file)
// Tests read none of them (tests/setup-env.ts sets their environment; the database comes from
// .env.test, see vitest.config.ts), so a developer's settings never leak into a test run.
export const ENV_FILES: Record<string, string> = { development: '.env.dev', production: '.env.prod' }
const nodeEnv = process.env.NODE_ENV ?? 'development'
if (nodeEnv !== 'test') {
  dotenvFlow.config({ files: ['.env', ...(ENV_FILES[nodeEnv] ? [ENV_FILES[nodeEnv]] : [])], silent: true })
}

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
  /** interface the API listens on (the Docker image: 127.0.0.1, only nginx reaches it) */
  HOST: Joi.string().default('0.0.0.0'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
  /** also write access-YYYY-MM-DD.log and error-YYYY-MM-DD.log here (rotated daily) */
  LOG_DIR: Joi.string().allow('').optional(),
  LOG_RETENTION_DAYS: Joi.number().integer().min(1).default(14),
  /** every API route is mounted under it (the health probes are also served at the root) */
  BASE_PATH: Joi.string().allow('').default('/api/v1'),
  /**
   * the public URL of the web app, e.g. https://mydomain/testpulse behind a reverse proxy on a sub
   * path: invite links, the CORS origin and the public paths (cookies, file URLs) come from it
   */
  BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),

  MONGODB_URI: Joi.string()
    .uri({ scheme: ['mongodb', 'mongodb+srv'] })
    .required(),
  MAX_PAGE_SIZE: Joi.number().integer().min(1).default(100),
  /** 0 keeps audit entries forever */
  AUDIT_RETENTION_DAYS: Joi.number().integer().min(0).default(0),
  /** notifications are deleted this many days after they were sent */
  NOTIFICATION_RETENTION_DAYS: Joi.number().integer().min(1).default(90),
  CRON_TIMEZONE: Joi.string().default('Asia/Bangkok'),

  JWT_PRIVATE_KEY: Joi.string().required(),
  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_ISSUER: Joi.string().default('testpulse'),
  JWT_AUDIENCE: Joi.string().default('testpulse-web'),
  ACCESS_TOKEN_TTL_SEC: Joi.number()
    .integer()
    .min(60)
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(7),
  /** a just-rotated refresh token still works this long (lost responses, two tabs at once) */
  REFRESH_REUSE_GRACE_SEC: Joi.number().integer().min(0).max(300).default(30),
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

  /** AI test case drafts: none (the AI actions stay hidden) · ollama: a local Ollama server */
  AI_PROVIDER: Joi.string().valid('none', 'ollama').default('none'),
  OLLAMA_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .when('AI_PROVIDER', { is: 'ollama', then: Joi.required(), otherwise: Joi.optional() }),
  OLLAMA_MODEL: Joi.string().when('AI_PROVIDER', { is: 'ollama', then: Joi.required(), otherwise: Joi.optional() }),
  /** how long a draft may take (a local model on a CPU is slow) */
  AI_TIMEOUT_SEC: Joi.number().integer().min(5).max(600).default(120),

  /**
   * the backup agent (PRD 5.15), e.g. http://127.0.0.1:8090 (embedded) or http://testpulse-backup:8090;
   * unset: the backup page says it is not set up. The token is the agent's BACKUP_AGENT_TOKEN (both ways).
   */
  BACKUP_AGENT_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .optional(),
  BACKUP_AGENT_TOKEN: Joi.string()
    .min(32)
    .when('BACKUP_AGENT_URL', { is: Joi.string().min(1).required(), then: Joi.required(), otherwise: Joi.optional().allow('') }),

  CORS_ORIGINS: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.alternatives().try(Joi.boolean(), Joi.number(), Joi.string()).default(1),
  BODY_LIMIT: Joi.string().default('1mb'),
  /**
   * the first Admin, created by the first migration when the database has none (first start only;
   * remove the password from the environment afterwards and change it in the app)
   */
  INITIAL_ADMIN_EMAIL: Joi.string().email({ tlds: false }).allow('').optional(),
  INITIAL_ADMIN_NAME: Joi.string().max(120).default('ผู้ดูแลระบบ'),
  INITIAL_ADMIN_PASSWORD: Joi.string().min(8).max(128).allow('').optional(),
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
const baseUrl = new URL(String(env.BASE_URL))
/** "/testpulse" for https://mydomain/testpulse, "" at the root of a domain */
const publicPath = baseUrl.pathname.replace(/\/+$/, '')
const isProduction = env.NODE_ENV === 'production'

if (isProduction) {
  if (EXAMPLE_SECRETS.has(encryptionKeys[currentKeyId]!) || EXAMPLE_SECRETS.has(env.BLIND_INDEX_SALT)) {
    throw new Error('Refusing to start in production with the example encryption key or blind index salt')
  }
  if (env.MAIL_DRIVER !== 'smtp') throw new Error('Refusing to start in production without MAIL_DRIVER=smtp (invites would never arrive)')
  const initialPassword = (env.INITIAL_ADMIN_PASSWORD as string | undefined) ?? ''
  if (initialPassword && (initialPassword.length < 12 || /^(password|admin|testpulse)\d*$/i.test(initialPassword))) {
    throw new Error('INITIAL_ADMIN_PASSWORD is too weak for production: at least 12 characters, not a common word')
  }
}

// calendar dates (due dates, "today", the shared rules in #contract/rules) follow the app's time zone,
// not the machine's; a TZ set in the environment wins
process.env.TZ ||= env.CRON_TIMEZONE as string

export const config = Object.freeze({
  env: env.NODE_ENV as 'development' | 'production' | 'test',
  isProduction,
  isTest: env.NODE_ENV === 'test',
  port: env.PORT as number,
  host: env.HOST as string,
  logLevel: env.LOG_LEVEL as string,
  logs: { dir: (env.LOG_DIR as string | undefined) || null, retentionDays: env.LOG_RETENTION_DAYS as number },
  basePath: normalizeBasePath(env.BASE_PATH),
  /** the web app's public URL without a trailing slash */
  baseUrl: `${baseUrl.origin}${publicPath}`,
  /** browsers call the API from here (CORS) */
  appOrigin: baseUrl.origin,
  /** path prefix of everything public (the proxy's sub path): cookies and file URLs carry it */
  publicPath,
  /** where browsers reach the API: publicPath + BASE_PATH, e.g. /testpulse/api/v1 */
  publicApiPath: `${publicPath}${normalizeBasePath(env.BASE_PATH)}`,
  mongo: { uri: env.MONGODB_URI as string },
  pagination: { maxPageSize: env.MAX_PAGE_SIZE as number },
  audit: { retentionDays: env.AUDIT_RETENTION_DAYS as number },
  notifications: { retentionDays: env.NOTIFICATION_RETENTION_DAYS as number },
  cron: { timezone: env.CRON_TIMEZONE as string },
  auth: {
    privateKey: pem(env.JWT_PRIVATE_KEY),
    publicKey: pem(env.JWT_PUBLIC_KEY),
    issuer: env.JWT_ISSUER as string,
    audience: env.JWT_AUDIENCE as string,
    accessTokenTtlSec: env.ACCESS_TOKEN_TTL_SEC as number,
    refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS as number,
    refreshReuseGraceSec: env.REFRESH_REUSE_GRACE_SEC as number,
    inviteTtlHours: env.INVITE_TTL_HOURS as number,
    cookieSecure: (env.COOKIE_SECURE ?? isProduction) as boolean,
  },
  encryption: { currentKeyId, keys: encryptionKeys },
  blindIndex: { salt: env.BLIND_INDEX_SALT as string },
  ai: {
    provider: env.AI_PROVIDER as 'none' | 'ollama',
    ollama: { baseUrl: String(env.OLLAMA_BASE_URL ?? '').replace(/\/+$/, ''), model: (env.OLLAMA_MODEL as string | undefined) ?? '' },
    timeoutMs: (env.AI_TIMEOUT_SEC as number) * 1000,
  },
  backupAgent: {
    url: String(env.BACKUP_AGENT_URL ?? '').replace(/\/+$/, '') || null,
    token: (env.BACKUP_AGENT_TOKEN as string | undefined) || null,
  },
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
  initialAdmin: {
    email: ((env.INITIAL_ADMIN_EMAIL as string | undefined) || null)?.toLowerCase() ?? null,
    name: env.INITIAL_ADMIN_NAME as string,
    password: (env.INITIAL_ADMIN_PASSWORD as string | undefined) || null,
  },
})

export type Config = typeof config
