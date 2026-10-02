import { ApiError } from '@/api/errors'
import { SESSION_EXPIRED } from '@/api/session'

// HTTP client of the real backend. Every response is { status: true, data } or
// { status: false, message, code?, requestId }. The access token lives in memory only (never in
// storage scripts can read); the refresh token is an httpOnly cookie the browser sends to
// /auth/* by itself. A 401 refreshes once and retries; when that fails the session is over.

/** the API, relative to the app's public path (<base href>): works behind the dev proxy and any sub path */
const apiUrl = (path: string) => new URL(`api/v1${path}`, document.baseURI).toString()

let accessToken: string | null = null
export const setAccessToken = (token: string | null) => {
  accessToken = token
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

let refreshing: Promise<boolean> | null = null

/** POST /auth/refresh with the cookie; one at a time, shared by every request that hit a 401 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(apiUrl('/auth/refresh'), { method: 'POST', credentials: 'same-origin' })
    .then((res) => parse<AuthResult>(res))
    .then((session) => {
      setAccessToken(session.accessToken)
      return true
    })
    .catch(() => {
      setAccessToken(null)
      return false
    })
    .finally(() => (refreshing = null))
  return refreshing
}

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
    if (await refreshSession()) res = await send()
    else window.dispatchEvent(new Event(SESSION_EXPIRED))
  }
  return parse<T>(res)
}

/** sign-in endpoints answer with a session: keep its token, return the user */
export async function startSession<U>(method: string, path: string, body?: unknown): Promise<U> {
  const session = await request<AuthResult>(method, path, { body, retry: false })
  setAccessToken(session.accessToken)
  return session.user as U
}

export const get = <T>(path: string) => request<T>('GET', path)
export const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body })
export const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, { body })
export const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body })
export const del = <T>(path: string) => request<T>('DELETE', path)
