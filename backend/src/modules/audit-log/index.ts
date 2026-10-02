import { setAuditSink } from '#core/audit/audit-sink.js'
import type { AppModule } from '#core/module.js'
import { AuditLogModel } from './audit-log.model.js'
import { auditLogRouter } from './audit-log.routes.js'
import { auditSink } from './audit-log.service.js'

// The audit trail: records what core's audit plugin and recordAudit() report, and lists it.
// Without this module the app still runs; changes are simply not recorded.
export const auditLogModule: AppModule = {
  name: 'audit-log',
  router: auditLogRouter,
  models: [AuditLogModel],
  setup() {
    setAuditSink(auditSink)
  },
}
