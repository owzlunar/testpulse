import { setAuditSink } from '#core/audit/audit-sink.js'
import { on } from '#core/events/event-bus.js'
import type { AppModule } from '#core/module.js'
import { AuditLogModel } from './audit-log.model.js'
import { auditLogRouter } from './audit-log.routes.js'
import { auditLogRepository } from './audit-log.repository.js'
import { auditSink } from './audit-log.service.js'

// The audit trail: records what core's audit plugin and recordAudit() report, and lists it.
// Without this module the app still runs; changes are simply not recorded.
export const auditLogModule: AppModule = {
  name: 'audit-log',
  router: auditLogRouter,
  models: [AuditLogModel],
  setup() {
    setAuditSink(auditSink)
    // each case keeps its own history when ids are renumbered; a deleted case's entries let its id go
    on('test-case.renamed', ({ projectId, renames, session }) => auditLogRepository.renameCases(projectId, renames, session))
    on('test-case.deleted', ({ projectId, ids }) => auditLogRepository.detachCases(projectId, ids))
  },
}
