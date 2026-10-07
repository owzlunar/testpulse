import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { BackupJobKind, BackupSettingsInput } from '#contract/types.js'
import { type Agent, ValidationError } from './agent.js'
import { BusyError } from './runner.js'

// The agent's HTTP API, for the TestPulse API only (Authorization: Bearer BACKUP_AGENT_TOKEN), on the
// internal network or 127.0.0.1. Answers { status, data } / { status: false, message } like the API.
//   GET  /health                  no token (container health checks)
//   GET  /status | /jobs | /jobs/:id/log | /snapshots | /settings
//   POST /jobs { kind, snapshot?, startedBy? }   202, 409 while another job runs
//   PUT  /settings
//   POST /alerts/test

const MAX_BODY = 64 * 1024
const KINDS: BackupJobKind[] = ['backup', 'verify', 'drill']

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'ข้อมูลใหญ่เกินไป')
    chunks.push(chunk)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'JSON ไม่ถูกต้อง')
  }
}

function authorized(req: IncomingMessage, token: string): boolean {
  const [scheme, given] = (req.headers.authorization ?? '').split(' ')
  if (scheme !== 'Bearer' || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createAgentServer(agent: Agent): Server {
  return createServer((req, res) => {
    void handle(agent, req, res).catch((err: Error) => {
      if (err instanceof HttpError) return send(res, err.status, { status: false, message: err.message })
      if (err instanceof ValidationError) return send(res, 422, { status: false, message: err.message })
      if (err instanceof BusyError) return send(res, 409, { status: false, message: 'มีงานอื่นกำลังทำอยู่ รอให้เสร็จก่อน', data: err.job })
      console.error(`[agent] ${req.method} ${req.url}: ${err.stack ?? err.message}`)
      send(res, 500, { status: false, message: 'agent ทำงานผิดพลาด (ดู log ของ agent)' })
    })
  })
}

async function handle(agent: Agent, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://agent')
  const route = `${req.method} ${url.pathname}`
  if (route === 'GET /health') return send(res, 200, { status: true, data: { ok: true } })
  if (!authorized(req, agent.config.token)) throw new HttpError(401, 'token ไม่ถูกต้อง')

  if (route === 'GET /status') return send(res, 200, { status: true, data: await agent.status() })
  if (route === 'GET /jobs') return send(res, 200, { status: true, data: agent.jobs.list() })
  const logMatch = /^GET \/jobs\/([\w-]+)\/log$/.exec(route)
  if (logMatch) {
    if (!agent.jobs.get(logMatch[1]!)) throw new HttpError(404, 'ไม่พบงานนี้')
    return send(res, 200, { status: true, data: { log: agent.jobs.readLog(logMatch[1]!) } })
  }
  if (route === 'POST /jobs') {
    const body = (await readBody(req)) as { kind?: unknown; snapshot?: unknown; startedBy?: unknown }
    if (!KINDS.includes(body.kind as BackupJobKind)) throw new HttpError(422, 'ประเภทงานไม่ถูกต้อง')
    const job = agent.startJob(
      body.kind as BackupJobKind,
      typeof body.startedBy === 'string' ? body.startedBy.slice(0, 120) : undefined,
      typeof body.snapshot === 'string' && body.snapshot ? body.snapshot : undefined,
    )
    return send(res, 202, { status: true, data: job })
  }
  if (route === 'GET /snapshots') return send(res, 200, { status: true, data: await agent.snapshots() })
  if (route === 'GET /settings') return send(res, 200, { status: true, data: agent.viewSettings() })
  if (route === 'PUT /settings') {
    return send(res, 200, { status: true, data: agent.updateSettings((await readBody(req)) as BackupSettingsInput) })
  }
  if (route === 'POST /alerts/test') return send(res, 200, { status: true, data: await agent.testAlerts() })
  throw new HttpError(404, 'ไม่พบ')
}
