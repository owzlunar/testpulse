import type { Request, Response } from 'express'

// Server-sent events: a response that stays open and gets `event:` / `data:` blocks as things happen.
// A stream belongs to the signed-in user who opened it and ends when their access token runs out
// (the client opens a new one with the renewed token, so permissions are checked again), when the
// client goes away, or when the server shuts down. A comment line every HEARTBEAT_MS keeps proxies
// from closing it as idle.

const HEARTBEAT_MS = 25_000

export interface EventStream {
  userId: string
  /** what the stream carries, e.g. 'notifications' */
  topic: string
  send(event: string, data: unknown): void
  close(): void
}

const open = new Set<EventStream>()

export function openEventStream(req: Request, res: Response, options: { topic: string; userId: string; endsAt?: number }): EventStream {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx (ours and any in front of it) passes events on at once instead of buffering them
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')

  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
  const expiry = options.endsAt ? setTimeout(() => stream.close(), Math.max(options.endsAt - Date.now(), 0)) : undefined
  const cleanUp = () => {
    clearInterval(heartbeat)
    clearTimeout(expiry)
    open.delete(stream)
  }
  const stream: EventStream = {
    userId: options.userId,
    topic: options.topic,
    send(event, data) {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    },
    close() {
      cleanUp()
      if (!res.writableEnded) res.end()
    },
  }
  req.on('close', cleanUp)
  open.add(stream)
  return stream
}

/** the open streams of a topic (e.g. to deliver a new notification to each person it is for) */
export const eventStreams = (topic: string): EventStream[] => [...open].filter((s) => s.topic === topic)

/** shutdown: end every stream so the server can close */
export function closeEventStreams(): void {
  for (const stream of [...open]) stream.close()
}
