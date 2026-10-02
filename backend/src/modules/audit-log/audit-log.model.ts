import mongoose, { Schema } from 'mongoose'
import type { AuditTrailEntry } from '#contract/types.js'
import { config } from '#core/config/env.js'
import { stringId } from '#core/database/ids.js'
import { toJSONPlugin } from '#core/database/plugins/to-json.js'

export interface AuditLogDoc extends Omit<AuditTrailEntry, 'id' | 'timestamp'> {
  _id: string
  timestamp: Date
  requestId?: string
  ip?: string
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    _id: stringId('audit'),
    timestamp: { type: Date, default: () => new Date(), immutable: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    projectId: { type: String },
    targetDeleted: { type: Boolean },
    targetTitle: { type: String, default: '' },
    details: { type: String, default: '' },
    changes: { type: [Schema.Types.Mixed], default: undefined },
    requestId: { type: String, private: true },
    ip: { type: String, private: true },
  },
  { collection: 'audit_logs', versionKey: false },
)

auditLogSchema.index({ timestamp: -1 })
auditLogSchema.index({ targetType: 1, projectId: 1, targetId: 1, timestamp: -1 })
auditLogSchema.index({ userId: 1, timestamp: -1 })
if (config.audit.retentionDays > 0) {
  auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: config.audit.retentionDays * 24 * 60 * 60, name: 'retention' })
}

// toJSON gives `id`; the stored Date becomes the contract's ISO string
auditLogSchema.plugin(toJSONPlugin)

export const AuditLogModel = mongoose.model<AuditLogDoc>('AuditLog', auditLogSchema)
