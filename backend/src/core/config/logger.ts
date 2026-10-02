import winston from 'winston'
import { config } from './env.js'
import { redact, sanitizeUrl } from './redact.js'

// Console only: JSON lines in production (for the container's log collector), readable lines elsewhere.

const redactFormat = winston.format((info) => {
  const { level, message, ...meta } = info
  return Object.assign(info, redact(meta), { level, message: typeof message === 'string' ? sanitizeUrl(message) : message })
})

const readable = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  return `[${String(timestamp)}] ${level} ${String(message)}${rest}`
})

export const logger = winston.createLogger({
  level: config.isTest ? 'error' : config.logLevel,
  format: config.isProduction
    ? winston.format.combine(redactFormat(), winston.format.timestamp(), winston.format.json())
    : winston.format.combine(redactFormat(), winston.format.colorize(), winston.format.timestamp({ format: 'HH:mm:ss' }), readable),
  transports: [new winston.transports.Console()],
  exitOnError: false,
})
