import { AsyncLocalStorage } from 'node:async_hooks'
import type { Principal } from '../auth/principal.js'

// Who is making the current request, available anywhere below the request (services, Mongoose plugins)
// without passing it down. Jobs and scripts run outside a request: no context, the actor is "system".

export interface RequestContext {
  requestId: string
  ip?: string
  userAgent?: string
  principal?: Principal
  /** when the access token of the request runs out (ms since the epoch): long-lived streams end there */
  tokenExpiresAt?: number
}

const storage = new AsyncLocalStorage<RequestContext>()

export const runWithContext = <T>(context: RequestContext, fn: () => T): T => storage.run(context, fn)
export const requestContext = (): RequestContext | undefined => storage.getStore()
export const currentPrincipal = (): Principal | undefined => storage.getStore()?.principal
