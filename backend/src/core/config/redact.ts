// Keeps secrets and personal data out of logs: query strings, keys of logged objects.

const SENSITIVE_QUERY = /([?&](?:token|access_token|refresh_token|password|secret|email)=)[^&]*/gi
const SENSITIVE_KEYS = new Set(['password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken', 'authorization', 'cookie', 'secret', 'email'])

export const sanitizeUrl = (url: string): string => url.replace(SENSITIVE_QUERY, '$1[REDACTED]')

/** deep copy of `value` with sensitive keys replaced */
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redact(v)) as T
  if (!value || typeof value !== 'object' || value instanceof Date || value instanceof Error) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : typeof v === 'string' && /url|path/i.test(key) ? sanitizeUrl(v) : redact(v)
  }
  return out as T
}
