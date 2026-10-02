// The mock "server": every mock API function runs its handler through `respond()`, so the UI deals
// with latency, loading states and errors exactly as with the real backend.

/** simulated round-trip time (ms); none in unit tests */
export const LATENCY = import.meta.env.MODE === 'test' ? { min: 0, max: 0 } : { min: 150, max: 450 }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Run `handler` as the "server", after a network-like delay. The result is a deep copy (like a JSON response). */
export async function respond<T>(handler: () => T, latency = LATENCY.min + Math.random() * (LATENCY.max - LATENCY.min)): Promise<T> {
  await sleep(latency)
  const result = handler()
  return result === undefined ? result : (JSON.parse(JSON.stringify(result)) as T)
}
