import { ApiError } from '@/api/errors'
import { SESSION_EXPIRED } from '@/api/session'

// HTTP client of the real backend. Every response is { status: true, data } or
// { status: false, message, code?, requestId }. The access token lives in memory only (never in
// storage scripts can read); the refresh token is an httpOnly cookie the browser sends to
// /auth/* by itself.
// Silent refresh: the access token (15 min) is renewed shortly before it expires, and as soon as the tab
// is back if its timer was held up while hidden, so requests rarely meet an expired token. A 401 still
// refreshes once and retries. When the refresh token (7 days, renewed by every refresh) is refused the
// session is over (SESSION_EXPIRED); when the server can't be reached it tries again later.

/** the API, relative to the app's public path (<base href>): works behind the dev proxy and any sub path */
const apiUrl = (path: string) => new URL(`api/v1${path}`, document.baseURI).toString()

let accessToken: string | null = null
/** when to renew the access token (ms since epoch) */
let renewAt = 0
let renewTimer: ReturnType<typeof setTimeout> | undefined

/** renew this long before expiry: a minute, or a quarter of a short token's life */
const renewAhead = (ttlMs: number) => Math.min(60_000, ttlMs / 4)
/** wait before trying again when the server couldn't be reached */
const RETRY_OFFLINE_MS = 30_000

function scheduleRenew(delayMs: number) {
  clearTimeout(renewTimer)
  renewAt = Date.now() + delayMs
  renewTimer = setTimeout(silentRefresh, delayMs)
}

/** keep the access token of a new session (null: signed out) and plan its renewal */
export function setSession(token: string | null, expiresIn = 0) {
  accessToken = token
  clearTimeout(renewTimer)
  renewAt = 0
  if (!token) return
  const ttl = expiresIn * 1000
  scheduleRenew(ttl - renewAhead(ttl))
}

interface Envelope<T> {
  status: boolean
  data?: T
  message?: string
  code?: string
  requestId?: string
}

async function parse<T>(res: Response): Promise<T> {
  let body: Envelope<T> | null = null
  try {
    body = (await res.json()) as Envelope<T>
  } catch {
    // not JSON (proxy error page, network): fall through to the generic error
  }
  if (res.ok && body?.status) return body.data as T
  const message = body?.message ?? (res.status >= 500 || !res.status ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่' : `คำขอไม่สำเร็จ (${res.status})`)
  throw new ApiError(body?.requestId && res.status >= 500 ? `${message} [${body.requestId}]` : message, res.status, body?.code)
}

interface AuthResult {
  user: unknown
  accessToken: string
  expiresIn: number
}

/** ok: a new access token; expired: the refresh token was refused (sign in again); offline: no answer */
type RefreshResult = 'ok' | 'expired' | 'offline'
let refreshing: Promise<RefreshResult> | null = null

/** POST /auth/refresh with the cookie; one at a time, shared by the timer and every request that hit a 401 */
function renew(): Promise<RefreshResult> {
  refreshing ??= fetch(apiUrl('/auth/refresh'), { method: 'POST', credentials: 'same-origin' })
    .then((res) => parse<AuthResult>(res))
    .then((session): RefreshResult => {
      setSession(session.accessToken, session.expiresIn)
      return 'ok'
    })
    .catch((e: unknown): RefreshResult => {
      // 4xx: the server refused the refresh token; anything else (network, 5xx): try again later
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setSession(null)
        return 'expired'
      }
      return 'offline'
    })
    .finally(() => (refreshing = null))
  return refreshing
}

/** restore or renew the session from the refresh cookie (app start); true when there is one */
export const refreshSession = () => renew().then((result) => result === 'ok')

/** the timer (or the tab coming back) renews the token before it runs out */
async function silentRefresh() {
  if (!accessToken) return
  const result = await renew()
  if (result === 'expired') window.dispatchEvent(new Event(SESSION_EXPIRED))
  else if (result === 'offline' && accessToken) scheduleRenew(RETRY_OFFLINE_MS)
}

// a hidden tab's timers are held up (the computer slept, the browser throttled them): renew on return
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && accessToken && Date.now() >= renewAt) void silentRefresh()
})

interface RequestOptions {
  /** JSON body, or FormData for uploads */
  body?: unknown
  /** false: never try to refresh on 401 (login, refresh itself) */
  retry?: boolean
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const send = () => {
    const isForm = options.body instanceof FormData
    const headers: Record<string, string> = {}
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
    return fetch(apiUrl(path), {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
    })
  }
  let res: Response
  try {
    res = await send()
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่าย', 0, 'network')
  }
  if (res.status === 401 && options.retry !== false) {
    const result = await renew()
    if (result === 'offline') throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบเครือข่าย', 0, 'network')
    if (result === 'expired') window.dispatchEvent(new Event(SESSION_EXPIRED))
    else res = await send()
  }
  return parse<T>(res)
}

// --- event streams (server-sent events) --------------------------------------------------------
// Read with fetch rather than EventSource, which can't send the access token. The server ends a
// stream when the token it was opened with runs out; it is reopened with the renewed one. Lost
// connections (network, backend restart) are retried, waiting longer each time (up to 30 s).

export interface StreamHandlers {
  /** connected (again): anything sent meanwhile was missed */
  open(): void
  event(name: string, data: unknown): void
}

const STREAM_RETRY_MIN_MS = 1_000
const STREAM_RETRY_MAX_MS = 30_000
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** the `event:` / `data:` blocks of a stream, until it ends */
async function readEvents(body: ReadableStream<Uint8Array>, onEvent: StreamHandlers['event']) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value
    let end: number
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      let name = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      // comment-only blocks (": ping") carry no data
      if (data.length) onEvent(name, JSON.parse(data.join('\n')))
    }
  }
}

/** keep a stream of GET `path` open until stop() is called; returns stop */
export function openStream(path: string, handlers: StreamHandlers): () => void {
  let stopped = false
  let controller: AbortController | null = null
  let wait = STREAM_RETRY_MIN_MS

  async function run() {
    while (!stopped) {
      controller = new AbortController()
      try {
        const res = await fetch(apiUrl(path), {
          headers: { Accept: 'text/event-stream', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          credentials: 'same-origin',
          signal: controller.signal,
        })
        if (res.status === 401) {
          const result = await renew()
          if (result === 'expired') {
            window.dispatchEvent(new Event(SESSION_EXPIRED))
            return
          }
          if (result === 'ok') continue
        } else if (res.ok && res.body) {
          wait = STREAM_RETRY_MIN_MS
          handlers.open()
          await readEvents(res.body, handlers.event)
        }
      } catch {
        // network error, or stop() aborted it
      }
      if (stopped) return
      await pause(wait)
      wait = Math.min(wait * 2, STREAM_RETRY_MAX_MS)
    }
  }

  void run()
  return () => {
    stopped = true
    controller?.abort()
  }
}

/** sign-in endpoints answer with a session: keep its token, return the user */
export async function startSession<U>(method: string, path: string, body?: unknown): Promise<U> {
  const session = await request<AuthResult>(method, path, { body, retry: false })
  setSession(session.accessToken, session.expiresIn)
  return session.user as U
}

export const get = <T>(path: string) => request<T>('GET', path)
export const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body })
/** "?q=…&limit=…&offset=…" of a search */
export const searchQuery = (q: string, limit: number, offset: number) => `?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
export const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, { body })
export const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body })
export const del = <T>(path: string) => request<T>('DELETE', path)
