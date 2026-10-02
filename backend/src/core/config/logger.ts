import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { config } from './env.js'
import { redact, sanitizeUrl } from './redact.js'

// Console: JSON lines in production (the container's log collector), readable lines elsewhere.
// With LOG_DIR also files, rotated daily and kept LOG_RETENTION_DAYS:
//   access-YYYY-MM-DD.log  one line per request (level http only)
//   error-YYYY-MM-DD.log   errors only

const redactFormat = winston.format((info) => {
  const { level, message, ...meta } = info
  return Object.assign(info, redact(meta), { level, message: typeof message === 'string' ? sanitizeUrl(message) : message })
})

const readable = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  return `[${String(timestamp)}] ${level} ${String(message)}${rest}`
})

const onlyLevel = (level: string) => winston.format((info) => (info.level === level ? info : false))()
const json = winston.format.combine(redactFormat(), winston.format.timestamp(), winston.format.json())

const consoleLevel = config.isTest ? 'error' : config.logLevel
const transports: winston.transport[] = [
  new winston.transports.Console({
    level: consoleLevel,
    format: config.isProduction
      ? json
      : winston.format.combine(redactFormat(), winston.format.colorize(), winston.format.timestamp({ format: 'HH:mm:ss' }), readable),
  }),
]

if (config.logs.dir && !config.isTest) {
  const file = (name: string, level: string, format: winston.Logform.Format) =>
    new DailyRotateFile({
      dirname: config.logs.dir!,
      filename: `${name}-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxFiles: `${config.logs.retentionDays}d`,
      zippedArchive: true,
      level,
      format,
    })
  transports.push(
    file(
      'access',
      'http',
      winston.format.combine(
        onlyLevel('http'),
        winston.format.timestamp(),
        winston.format.printf((i) => `${String(i.timestamp)} ${String(i.message)}`),
      ),
    ),
    file('error', 'error', json),
  )
}

// the logger passes everything down to `http` when access logs are written; each transport filters
const levels = winston.config.npm.levels
const loggerLevel = config.logs.dir && levels[consoleLevel]! < levels.http! ? 'http' : consoleLevel

export const logger = winston.createLogger({ level: loggerLevel, transports, exitOnError: false })
