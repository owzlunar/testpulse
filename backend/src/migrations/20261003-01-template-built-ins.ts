import { logger } from '#core/config/logger.js'
import type { Migration } from '#core/database/migrations.js'
import { templates } from '#modules/template/index.js'

// The test case templates shipped with the system (login, forms, payments …), on every database.
export const builtInTemplates: Migration = {
  id: '20261003-01-template-built-ins',
  description: 'the built-in test case templates',
  async up() {
    const added = await templates.ensureBuiltIns()
    if (added) logger.info(`[migrate] ${added} built-in test case templates added`)
  },
}
