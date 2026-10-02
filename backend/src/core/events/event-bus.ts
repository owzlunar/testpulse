// In-process domain events: how modules react to each other without importing each other's internals
// (e.g. the project module drops a deleted team from its projects). A module declares the events it
// emits by augmenting `DomainEvents`:
//
//   declare module '#core/events/event-bus.js' {
//     interface DomainEvents { 'team.deleted': { teamId: string } }
//   }
//
// `emit` waits for every handler and returns their results in registration order.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DomainEvents {}

type Handler<P> = (payload: P) => unknown

const handlers = new Map<string, Handler<never>[]>()

export function on<E extends keyof DomainEvents>(event: E, handler: Handler<DomainEvents[E]>): void {
  const list = handlers.get(event as string) ?? []
  list.push(handler as Handler<never>)
  handlers.set(event as string, list)
}

export async function emit<E extends keyof DomainEvents>(event: E, payload: DomainEvents[E]): Promise<unknown[]> {
  const results: unknown[] = []
  for (const handler of handlers.get(event as string) ?? []) results.push(await (handler as Handler<DomainEvents[E]>)(payload))
  return results
}

/** tests: start from no handlers */
export const clearEventHandlers = () => handlers.clear()
