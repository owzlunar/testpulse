import type { NotificationItem } from '#contract/types.js'
import { logger } from '../config/logger.js'

// Modules tell people about a change with notify(), in the same request as the change; who sent it
// comes from the request. Where it goes is up to the notification module, which registers itself as
// the sink at start-up. Without it (an app built without that module) notifying is a no-op.

export type NotifyEvent = Pick<NotificationItem, 'type' | 'title' | 'message' | 'severity' | 'projectId' | 'testCaseId' | 'to'>

export interface NotifySink {
  send(event: NotifyEvent): Promise<void>
}

let sink: NotifySink | null = null

export function setNotifySink(next: NotifySink | null): void {
  sink = next
}

/** never fails the request: the change has already been saved when this runs */
export async function notify(event: NotifyEvent): Promise<void> {
  if (!sink) return
  try {
    await sink.send(event)
  } catch (err) {
    logger.error(`Notification not sent (${event.type} "${event.title}"): ${(err as Error).message}`)
  }
}
