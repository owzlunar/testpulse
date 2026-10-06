import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The backup agent's settings: its own environment plus the scripts' backup.env (BACKUP_ENV), the one
// file that holds every password it needs. Nothing comes from the API's environment (.env.prod): the
// agent may run in a container of its own. Missing or weak secrets stop it at start-up.

/** KEY=value lines as the scripts read them (backup-common.sh load_env): # comments, optional quotes */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) throw new Error(`not a KEY=value line: ${line.slice(0, 40)}`)
    const key = line.slice(0, eq)
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`not a KEY=value line: ${line.slice(0, 40)}`)
    let value = line.slice(eq + 1)
    const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value)
    if (quoted) value = quoted[1]!
    out[key] = value
  }
  return out
}

export interface S3Target {
  url: string
  accessKey: string
  secretKey: string
}

export interface AgentConfig {
  mode: 'embedded' | 'separate'
  host: string
  port: number
  /** the API sends it as `Authorization: Bearer`; the agent sends it back on its callbacks */
  token: string
  /** AES-256 key (64 hex) for the secrets in settings.json */
  secretKey: Buffer
  /** the API's base, e.g. http://127.0.0.1:8081/api/v1: in-app notifications and email go through it */
  apiUrl: string | null
  /** the web app's public URL, for the link in a Teams message */
  appUrl: string | null
  timezone: string
  /** settings.json, jobs.json, logs/ */
  dataDir: string
  scriptsDir: string
  /** the scripts' settings file, read again by every script run */
  envFile: string
  tools: 'docker' | 'local'
  mongo: { liveUri: string; restoreUri: string; liveDb: string; drillDb: string }
  storage: { local: S3Target; offsite: S3Target | null; backupBucket: string; uploadsBucket: string; driver: 'local' | 'minio' }
}

const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/

/** the database name in a mongodb:// URI (between the host list and the `?`), as the scripts' uri_db */
export function uriDb(uri: string): string {
  const rest = uri.replace(/^[a-z+]+:\/\//, '')
  const slash = rest.indexOf('/')
  const name = slash < 0 ? '' : rest.slice(slash + 1).split('?')[0]!
  if (!name) throw new Error('the MongoDB URI names no database')
  return name
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const envFile = resolve(env.BACKUP_ENV ?? '/run/testpulse-backup/backup.env')
  let file: Record<string, string>
  try {
    file = parseEnvFile(readFileSync(envFile, 'utf8'))
  } catch (err) {
    throw new Error(`BACKUP_ENV ${envFile}: ${(err as Error).message}`, { cause: err })
  }
  // the agent's own environment wins over the file (like docker's environment over env_file)
  const get = (key: string): string | undefined => env[key] || file[key] || undefined
  const need = (key: string): string => {
    const value = get(key)
    if (!value) throw new Error(`${key} is not set (${envFile} or the environment)`)
    return value
  }

  const token = need('BACKUP_AGENT_TOKEN')
  if (token.length < 32) throw new Error('BACKUP_AGENT_TOKEN must be at least 32 characters (openssl rand -hex 32)')
  const secret = need('BACKUP_AGENT_SECRET')
  if (!HEX_32_BYTES.test(secret)) throw new Error('BACKUP_AGENT_SECRET must be 64 hex characters (openssl rand -hex 32)')

  const mode = get('BACKUP_AGENT') === 'separate' ? 'separate' : 'embedded'
  const tools = get('BACKUP_TOOLS') === 'local' ? 'local' : 'docker'
  const liveUri = need('MONGODB_URI')
  const liveDb = uriDb(liveUri)
  const offsiteUrl = get('OFFSITE_S3_URL')
  const driver = get('STORAGE_DRIVER') === 'minio' ? 'minio' : 'local'
  const port = Number(get('AGENT_PORT') ?? 8090)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AGENT_PORT must be a port number')

  return {
    mode,
    host: get('AGENT_HOST') ?? (mode === 'embedded' ? '127.0.0.1' : '0.0.0.0'),
    port,
    token,
    secretKey: Buffer.from(secret, 'hex'),
    apiUrl: get('AGENT_API_URL')?.replace(/\/+$/, '') ?? null,
    appUrl: get('AGENT_APP_URL')?.replace(/\/+$/, '') ?? null,
    timezone: get('CRON_TIMEZONE') ?? 'Asia/Bangkok',
    dataDir: resolve(get('AGENT_DATA_DIR') ?? '/var/lib/testpulse-backup'),
    scriptsDir: resolve(get('AGENT_SCRIPTS_DIR') ?? '/app/scripts'),
    envFile,
    tools,
    mongo: { liveUri, restoreUri: get('RESTORE_MONGODB_URI') ?? liveUri, liveDb, drillDb: `${liveDb}-restore` },
    storage: {
      local: { url: need('BACKUP_S3_URL'), accessKey: need('BACKUP_S3_ACCESS_KEY'), secretKey: need('BACKUP_S3_SECRET_KEY') },
      offsite: offsiteUrl ? { url: offsiteUrl, accessKey: need('OFFSITE_S3_ACCESS_KEY'), secretKey: need('OFFSITE_S3_SECRET_KEY') } : null,
      backupBucket: get('BACKUP_BUCKET') ?? 'testpulse-backups',
      uploadsBucket: get('UPLOADS_BUCKET') ?? 'testpulse',
      driver,
    },
  }
}
