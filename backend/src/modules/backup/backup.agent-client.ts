import { timingSafeEqual } from 'node:crypto'
import { config } from '#core/config/env.js'
import { logger } from '#core/config/logger.js'
import { ApiError } from '#core/http/errors.js'

// The backup agent's HTTP API (src/agent/http.ts), at BACKUP_AGENT_URL with BACKUP_AGENT_TOKEN. The API
// holds no password of any backup destination: it only asks the agent.

const TIMEOUT_MS = 15_000

export class AgentUnavailableError extends ApiError {
  constructor(detail: string) {
    super(503, 'ติดต่อ backup agent ไม่ได้ (ดูว่า agent ทำงานอยู่ และ BACKUP_AGENT_URL / BACKUP_AGENT_TOKEN ตรงกัน)', 'agent_unavailable')
    logger.warn(`[backup] agent unavailable: ${detail}`)
  }
}

export const agentConfigured = () => !!config.backupAgent.url && !!config.backupAgent.token

/** a call to the agent: its data, or its answer as an ApiError (409 busy, 422 invalid…), 503 when it does not answer */
export async function agentCall<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const { url, token } = config.backupAgent
  if (!url || !token) throw new ApiError(503, 'ยังไม่ได้ตั้งค่า backup agent (BACKUP_AGENT_URL)', 'agent_not_configured')
  let res: Response
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new AgentUnavailableError(`${method} ${path}: ${(err as Error).message}`)
  }
  const answer = (await res.json().catch(() => null)) as { status?: boolean; data?: T; message?: string } | null
  if (res.ok && answer?.status) return answer.data as T
  if (res.status === 401) throw new AgentUnavailableError(`${method} ${path}: the agent refused the token`)
  if (res.status >= 500 || !answer) throw new AgentUnavailableError(`${method} ${path}: HTTP ${res.status}`)
  throw new ApiError(res.status, answer.message ?? 'backup agent ไม่รับคำขอนี้', res.status === 409 ? 'busy' : undefined)
}

/** the agent's own calls to the API carry the same token */
export function isAgentToken(header: string | undefined): boolean {
  const token = config.backupAgent.token
  const [scheme, given] = (header ?? '').split(' ')
  if (!token || scheme !== 'Bearer' || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}
