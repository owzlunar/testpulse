import { logger } from '#core/config/logger.js'
import type { Migration } from '#core/database/migrations.js'
import { roles } from '#modules/role/index.js'

// The default roles besides Admin (QA Lead, QA Tester, Developer, with the permissions of the demo
// data), on every database. Roles an Admin already made or changed are left alone.
export const defaultRoles: Migration = {
  id: '20261004-01-role-defaults',
  description: 'the default roles (QA Lead, QA Tester, Developer)',
  async up() {
    const added = await roles.ensureDefaultRoles()
    if (added.length) logger.info(`[migrate] default roles added: ${added.join(', ')}`)
  },
}
