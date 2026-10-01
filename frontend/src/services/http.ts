// =============================================================================
// Mock HTTP layer.
// Every *.service.ts function that is part of the API contract goes through
// `respond()`, so the UI already deals with latency, loading states and errors.
// To connect the real backend, replace a service function body with a fetch()
// to the endpoint named in its JSDoc (e.g. `GET /projects`); stores and pages
// don't change.
// =============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 500,
    /** machine-readable reason, e.g. 'stale' (the data changed since the client loaded it) */
    public code?: string,
  ) {
    super(message)
  }
}

/** simulated round-trip time (ms); none in unit tests */
export const LATENCY = import.meta.env.MODE === 'test' ? { min: 0, max: 0 } : { min: 150, max: 450 }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Run `handler` as the "server", after a network-like delay. The result is a deep copy (like a JSON response). */
export async function respond<T>(handler: () => T, latency = LATENCY.min + Math.random() * (LATENCY.max - LATENCY.min)): Promise<T> {
  await sleep(latency)
  const result = handler()
  return result === undefined ? result : (JSON.parse(JSON.stringify(result)) as T)
}

/** Unique id like the backend would generate */
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Message for any thrown value (shown in the global error toast) */
export const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
