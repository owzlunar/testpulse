import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { setNotifySink } from '#core/notify/notify-sink.js'
import { NotificationModel } from './notification.model.js'
import { notificationRepository } from './notification.repository.js'
import { notificationRouter } from './notification.routes.js'
import { notificationService, notifySink } from './notification.service.js'

// Notifications: stores what other modules send with notify(), lists each person's own (who gets one
// is worked out when it is read, so team / role changes apply at once) and pushes new ones to the
// web app over an event stream. Without this module the app still runs; nobody is notified.
export const notificationModule: AppModule = {
  name: 'notification',
  router: notificationRouter,
  models: [NotificationModel],
  setup() {
    setNotifySink(notifySink)
    on('project.deleted', ({ projectId }) => notificationService.removeOfProject(projectId))
    on('test-case.renamed', ({ projectId, renames, session }) => notificationRepository.renameCases(projectId, renames, session))
    on('test-case.deleted', ({ projectId, ids }) => notificationRepository.detachCases(projectId, ids))
  },
}
